import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CartService } from '../cart/cart.service';
import { PrismaService } from '../database/prisma.service';
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

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly invoices: InvoiceService,
    private readonly carts: CartService,
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
    const order = await this.prisma.order.findUnique({
      relationLoadStrategy: 'join',
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order || order.userId) throw new NotFoundException('Order not found');
    await this.carts.requireOwnedCart(order.cartId, undefined, guestToken, false);
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

  async adminInvoiceUrl(orderId: string): Promise<{ url: string; expiresIn: number }> {
    const order = await this.prisma.order.findUnique({
      relationLoadStrategy: 'join',
      where: { id: orderId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.invoiceFor(order);
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

  listAdmin(input: ListAdminOrdersDto): Promise<OrderDetail[]> {
    const createdAt: Prisma.DateTimeFilter | undefined =
      input.from || input.to
        ? {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          }
        : undefined;
    return this.prisma.order.findMany({
      relationLoadStrategy: 'join',
      where: {
        status: input.status,
        userId: input.userId,
        createdAt,
        ...(input.search
          ? {
              OR: [
                { orderNumber: { contains: input.search, mode: 'insensitive' } },
                { hdfcOrderId: { contains: input.search, mode: 'insensitive' } },
                {
                  addressSnapshot: { path: ['email'], string_contains: input.search.toLowerCase() },
                },
                { addressSnapshot: { path: ['recipientName'], string_contains: input.search } },
              ],
            }
          : {}),
      },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      skip: input.offset,
      take: input.limit,
    });
  }

  async transition(
    actorId: string,
    orderId: string,
    target: OrderStatus,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<Order> {
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
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
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
