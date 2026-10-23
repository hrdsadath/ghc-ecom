import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Order, OrderStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CartService, orderCart, orderQuoteCartSelect } from '../cart/cart.service';
import { PUBLIC_CATALOGUE_CACHE_VERSION_KEY } from '../catalogue/catalogue.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ListAdminOrdersDto } from './dto/list-admin-orders.dto';
import { InvoiceService } from './invoice.service';

const orderInclude = {
  payments: {
    select: {
      id: true,
      hdfcTransactionId: true,
      status: true,
      amountPaise: true,
      currency: true,
      method: true,
      capturedAt: true,
      refunds: {
        select: {
          id: true,
          amountPaise: true,
          currency: true,
          status: true,
          reason: true,
          returnRequestId: true,
          processedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  invoice: true,
  shipments: {
    include: { items: true, events: { orderBy: { occurredAt: 'asc' as const } } },
    orderBy: { createdAt: 'asc' as const },
  },
  returns: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Admin list rows: just what the table shows; the detail is fetched when a row is opened. */
const adminOrderListSelect = {
  id: true,
  orderNumber: true,
  userId: true,
  status: true,
  currency: true,
  addressSnapshot: true,
  subtotalPaise: true,
  discountPaise: true,
  shippingPaise: true,
  taxPaise: true,
  totalPaise: true,
  hdfcOrderId: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
  payments: {
    select: { id: true, status: true, method: true, amountPaise: true, currency: true },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.OrderSelect;

export type AdminOrderSummary = Prisma.OrderGetPayload<{ select: typeof adminOrderListSelect }> & {
  itemCount: number;
};

export interface DailyRevenue {
  /** IST calendar day, YYYY-MM-DD. */
  date: string;
  capturedPaise: number;
  refundedPaise: number;
  netPaise: number;
  capturedPayments: number;
  processedRefunds: number;
}

export interface RevenueReport {
  timezone: 'Asia/Kolkata';
  days: DailyRevenue[];
  totals: Omit<DailyRevenue, 'date'>;
}

const REVENUE_TIMEZONE = 'Asia/Kolkata';

/** Paid orders staff may still cancel: nothing has left the warehouse yet. */
const ADMIN_CANCELLABLE = new Set(['confirmed', 'processing']);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly invoices: InvoiceService,
    private readonly carts: CartService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  listMine(userId: string): Promise<OrderDetail[]> {
    return this.prisma.order.findMany({
      relationLoadStrategy: 'join',
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getGuest(orderId: string, guestToken: string): Promise<OrderDetail> {
    // The cart's owner columns come back with the order, so ownership costs no extra query.
    const found = await this.prisma.order.findUnique({
      relationLoadStrategy: 'join',
      where: { id: orderId },
      include: { ...orderInclude, quote: { select: orderQuoteCartSelect } },
    });
    if (!found || found.userId) throw new NotFoundException('Order not found');
    const { quote, ...order } = found;
    await this.carts.assertCartOwner(orderCart(order, quote), undefined, guestToken);
    return order;
  }

  async guestInvoiceUrl(
    orderId: string,
    guestToken: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const order = await this.getGuest(orderId, guestToken);
    return this.invoiceFor(order);
  }

  async getMine(userId: string, orderId: string): Promise<OrderDetail> {
    const order = await this.prisma.order.findFirst({
      relationLoadStrategy: 'join',
      where: { id: orderId, userId },
      include: orderInclude,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async invoiceUrl(userId: string, orderId: string): Promise<{ url: string; expiresIn: number }> {
    const order = await this.getMine(userId, orderId);
    return this.invoiceFor(order);
  }

  /**
   * Staff can always download a paid order's invoice: if the `order.confirmed`
   * outbox job has not produced it yet, it is generated now through the same path.
   */
  async adminInvoiceUrl(orderId: string): Promise<{ url: string; expiresIn: number }> {
    const found = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { invoice: true },
    });
    if (!found) throw new NotFoundException('Order not found');
    const { invoice: existing, ...order } = found;
    if (!existing && !order.confirmedAt) {
      throw new NotFoundException('Invoices are only available for paid orders');
    }
    const invoice = existing ?? (await this.invoices.ensure(order));
    return {
      url: await this.invoices.signedUrl(invoice.storagePath),
      expiresIn: 300,
    };
  }

  async getAdmin(orderId: string): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      relationLoadStrategy: 'join',
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Daily revenue for the last `days` IST calendar days: captured payment
   * amounts minus processed refunds, each counted on the day it happened.
   */
  async revenue(days = 7): Promise<RevenueReport> {
    const span = days - 1;
    const rows = await this.prisma.$queryRaw<
      Array<{
        day: string;
        captured_paise: bigint;
        captured_payments: bigint;
        refunded_paise: bigint;
        processed_refunds: bigint;
      }>
    >`
      with window_start as (
        select (((now() at time zone ${REVENUE_TIMEZONE})::date - ${span}::int)::timestamp
          at time zone ${REVENUE_TIMEZONE}) as starts_at
      ),
      calendar as (
        select generate_series(
          (now() at time zone ${REVENUE_TIMEZONE})::date - ${span}::int,
          (now() at time zone ${REVENUE_TIMEZONE})::date,
          interval '1 day'
        )::date as day
      ),
      captured as (
        select (coalesce(p.captured_at, p.created_at) at time zone ${REVENUE_TIMEZONE})::date as day,
          sum(p.amount_paise)::bigint as paise,
          count(*)::bigint as total
        from public.payments p, window_start w
        where p.status in ('captured', 'refunded')
          and coalesce(p.captured_at, p.created_at) >= w.starts_at
        group by 1
      ),
      refunded as (
        select (r.processed_at at time zone ${REVENUE_TIMEZONE})::date as day,
          sum(r.amount_paise)::bigint as paise,
          count(*)::bigint as total
        from public.refunds r, window_start w
        where r.status = 'processed' and r.processed_at >= w.starts_at
        group by 1
      )
      select to_char(c.day, 'YYYY-MM-DD') as day,
        coalesce(cap.paise, 0)::bigint as captured_paise,
        coalesce(cap.total, 0)::bigint as captured_payments,
        coalesce(ref.paise, 0)::bigint as refunded_paise,
        coalesce(ref.total, 0)::bigint as processed_refunds
      from calendar c
      left join captured cap on cap.day = c.day
      left join refunded ref on ref.day = c.day
      order by c.day
    `;
    const report: RevenueReport = {
      timezone: REVENUE_TIMEZONE,
      days: rows.map((row) => {
        const capturedPaise = Number(row.captured_paise);
        const refundedPaise = Number(row.refunded_paise);
        return {
          date: row.day,
          capturedPaise,
          refundedPaise,
          netPaise: capturedPaise - refundedPaise,
          capturedPayments: Number(row.captured_payments),
          processedRefunds: Number(row.processed_refunds),
        };
      }),
      totals: {
        capturedPaise: 0,
        refundedPaise: 0,
        netPaise: 0,
        capturedPayments: 0,
        processedRefunds: 0,
      },
    };
    for (const day of report.days) {
      report.totals.capturedPaise += day.capturedPaise;
      report.totals.refundedPaise += day.refundedPaise;
      report.totals.netPaise += day.netPaise;
      report.totals.capturedPayments += day.capturedPayments;
      report.totals.processedRefunds += day.processedRefunds;
    }
    return report;
  }

  private async invoiceFor(order: OrderDetail): Promise<{ url: string; expiresIn: number }> {
    if (!order.invoice) {
      throw new NotFoundException('Invoice is not ready');
    }
    return {
      url: await this.invoices.signedUrl(order.invoice.storagePath),
      expiresIn: 300,
    };
  }

  async cancelMine(userId: string, orderId: string): Promise<Order> {
    await this.getMine(userId, orderId);
    try {
      await this.prisma.$executeRaw`select public.cancel_order(${orderId}::uuid)`;
    } catch (error) {
      throw this.transitionError(error);
    }
    return this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  }

  /**
   * Admin cancellation of a paid order that has not shipped. It ends in the same
   * `orders.status = 'cancelled'` update as a customer cancellation, so the
   * `order.cancelled` outbox event refunds the captured payment through HDFC
   * (RefundsService.refundOrderCancellation) and notifies the customer.
   */
  async cancelAdmin(
    actorId: string,
    orderId: string,
    reason: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<OrderDetail> {
    const note = reason.trim();
    if (!note) throw new BadRequestException('A cancellation reason is required');
    try {
      await this.prisma.$transaction(async (transaction) => {
        // The row lock serialises two staff cancelling (or shipping) the same order at once.
        const [row] = await transaction.$queryRaw<Array<{ status: string; cart_id: string }>>`
          select status::text as status, cart_id::text as cart_id
          from public.orders where id = ${orderId}::uuid for update`;
        if (!row) throw new NotFoundException('Order not found');
        if (row.status === 'cancelled') {
          throw new ConflictException('This order is already cancelled');
        }
        if (!ADMIN_CANCELLABLE.has(row.status)) {
          throw new BadRequestException(
            'Only confirmed or processing orders that have not shipped can be cancelled',
          );
        }
        if (row.status === 'confirmed') {
          await transaction.$executeRaw`select public.cancel_order(${orderId}::uuid)`;
        } else {
          const active = await transaction.shipment.findFirst({
            where: { orderId, status: { not: ShipmentStatus.CANCELLED } },
            select: { id: true },
          });
          if (active) {
            throw new ConflictException(
              'This order has a shipment; cancel the shipment before cancelling the order',
            );
          }
          await this.releaseConsumedStock(transaction, orderId, row.cart_id);
          await transaction.$executeRaw`
            update public.orders set status = 'cancelled' where id = ${orderId}::uuid`;
        }
        await transaction.auditLog.create({
          data: {
            actorId,
            action: 'order.admin_cancelled',
            entityType: 'order',
            entityId: orderId,
            metadata: { from: row.status.toUpperCase(), reason: note },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw this.transitionError(error);
    }
    await this.invalidateCatalogue();
    return this.getAdmin(orderId);
  }

  /**
   * `public.cancel_order` only accepts confirmed orders, but a processing order
   * holds stock the same way (reservations consumed at payment, no shipment).
   * This mirrors that function's confirmed branch statement for statement.
   */
  private async releaseConsumedStock(
    transaction: Prisma.TransactionClient,
    orderId: string,
    cartId: string,
  ): Promise<void> {
    const reservations = await transaction.$queryRaw<
      Array<{ id: string; warehouse_id: string; variant_id: string; quantity: number }>
    >`
      select id::text as id, warehouse_id::text as warehouse_id,
        variant_id::text as variant_id, quantity
      from public.inventory_reservations
      where cart_id = ${cartId}::uuid and status = 'consumed'
      order by variant_id
      for update`;
    for (const reservation of reservations) {
      const restored = await transaction.$executeRaw`
        update public.inventory_levels
        set on_hand = on_hand + ${reservation.quantity}
        where warehouse_id = ${reservation.warehouse_id}::uuid
          and variant_id = ${reservation.variant_id}::uuid`;
      if (restored === 0) throw new Error('inventory level missing for cancellation');
      await transaction.$executeRaw`
        update public.inventory_reservations set status = 'released'
        where id = ${reservation.id}::uuid`;
      await transaction.$executeRaw`
        insert into public.stock_movements (
          warehouse_id, variant_id, type, quantity, reference_type, reference_id, metadata
        ) values (
          ${reservation.warehouse_id}::uuid,
          ${reservation.variant_id}::uuid,
          'return',
          ${reservation.quantity},
          'order_cancellation',
          ${orderId},
          jsonb_build_object('reason', 'cancelled_before_fulfilment')
        )`;
    }
  }

  private async invalidateCatalogue(): Promise<void> {
    try {
      await this.redis?.increment(PUBLIC_CATALOGUE_CACHE_VERSION_KEY);
    } catch (error) {
      // Released stock is already committed; the cache catches up on its own TTL.
      this.logger.warn(
        `Catalogue cache version bump failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async listAdmin(input: ListAdminOrdersDto): Promise<AdminOrderSummary[]> {
    const createdAt: Prisma.DateTimeFilter | undefined =
      input.from || input.to
        ? {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          }
        : undefined;
    const search = input.search?.trim();
    const orders = await this.prisma.order.findMany({
      relationLoadStrategy: 'join',
      where: {
        status: input.status,
        userId: input.userId,
        createdAt,
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search, mode: 'insensitive' } },
                { hdfcOrderId: { contains: search, mode: 'insensitive' } },
                {
                  addressSnapshot: {
                    path: ['email'],
                    string_contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  addressSnapshot: {
                    path: ['recipientName'],
                    string_contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      select: adminOrderListSelect,
      orderBy: { createdAt: 'desc' },
      skip: input.offset,
      take: input.limit,
    });
    if (!orders.length) return [];
    // Line counts come from the database so the item snapshots never leave it for the list.
    const counts = await this.prisma.$queryRaw<Array<{ id: string; item_count: number }>>`
      select id::text as id,
        case when jsonb_typeof(items_snapshot) = 'array'
          then jsonb_array_length(items_snapshot) else 0 end as item_count
      from public.orders
      where id = any(${orders.map((order) => order.id)}::uuid[])
    `;
    const itemCounts = new Map(counts.map((row) => [row.id, Number(row.item_count)]));
    return orders.map((order) => ({ ...order, itemCount: itemCounts.get(order.id) ?? 0 }));
  }

  async transition(
    actorId: string,
    orderId: string,
    target: OrderStatus,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<OrderDetail> {
    const before = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!before) {
      throw new NotFoundException('Order not found');
    }
    try {
      const databaseTarget = target.toLowerCase();
      await this.prisma.$executeRaw`select public.transition_order_status(
        ${orderId}::uuid,
        ${databaseTarget}::public.order_status
      )`;
    } catch (error) {
      throw this.transitionError(error);
    }
    // The full admin detail, so the caller can replace its row without losing payments or shipments.
    const order = await this.prisma.order.findUniqueOrThrow({
      relationLoadStrategy: 'join',
      where: { id: orderId },
      include: orderInclude,
    });
    await this.audit.record({
      actorId,
      action: 'order.status_changed',
      entityType: 'order',
      entityId: orderId,
      metadata: { from: before.status, to: target },
      ...context,
    });
    return order;
  }

  private transitionError(error: unknown): BadRequestException {
    const message = error instanceof Error ? error.message : '';
    if (/order not found/i.test(message)) {
      return new BadRequestException('Order not found');
    }
    return new BadRequestException('Order state transition is not allowed');
  }
}
