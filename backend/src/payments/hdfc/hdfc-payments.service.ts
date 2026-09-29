import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Order, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { CartService } from '../../cart/cart.service';
import { PrismaService } from '../../database/prisma.service';
import { orderCreateData, requireActiveQuote, toInputJson } from '../order-factory';
import { CreateHdfcIntentDto } from './dto/create-hdfc-intent.dto';
import { HdfcCustomer, HdfcGatewayService, HdfcOrderStatus } from './hdfc-gateway.service';

export interface HdfcPaymentIntent {
  provider: 'hdfc';
  orderId: string;
  orderNumber: string;
  /** Id SmartGateway echoes back as `order_id` on the storefront return URL. */
  hdfcOrderId: string;
  amount: number;
  currency: string;
  /** SmartGateway hosted payment page; the browser navigates here. */
  paymentUrl: string;
}

export interface ReconciliationResult {
  inspected: number;
  confirmed: number;
  failed: number;
  pending: number;
  errors: number;
}

export type HdfcResultOutcome = 'success' | 'failed' | 'pending';

@Injectable()
export class HdfcPaymentsService {
  private readonly logger = new Logger(HdfcPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly gateway: HdfcGatewayService,
  ) {}

  async createIntent(
    input: CreateHdfcIntentDto,
    authorization?: string,
    guestToken?: string,
  ): Promise<HdfcPaymentIntent> {
    this.requireEnabled();
    const quote = await this.prisma.checkoutQuote.findUnique({ where: { id: input.quoteId } });
    if (!quote) {
      throw new NotFoundException('Checkout quote not found');
    }
    await this.carts.requireAccessibleCart(quote.cartId, authorization, guestToken);
    requireActiveQuote(quote);

    const order = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`select pg_advisory_xact_lock(
          hashtextextended(${quote.id}::text, 0)
        )`;
        const existing = await transaction.order.findUnique({ where: { quoteId: quote.id } });
        if (existing?.hdfcOrderId) {
          return existing;
        }
        if (existing) {
          // A pre-SmartGateway (Razorpay) order; it can no longer be paid.
          throw new ConflictException('Checkout quote belongs to a legacy order');
        }
        return transaction.order.create({
          data: {
            ...orderCreateData(quote),
            hdfcOrderId: HdfcPaymentsService.newGatewayOrderId(),
          },
        });
      },
      { timeout: 20_000 },
    );
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      throw new ConflictException('Order is no longer awaiting payment');
    }
    // SmartGateway returns the existing session when the same order_id is sent
    // again, so a retried checkout reuses the order instead of creating a new one.
    const session = await this.gateway.createSession(order, HdfcPaymentsService.customerFor(order));
    return {
      provider: 'hdfc',
      orderId: order.id,
      orderNumber: order.orderNumber,
      hdfcOrderId: order.hdfcOrderId!,
      amount: order.totalPaise,
      currency: order.currency,
      paymentUrl: session.paymentUrl,
    };
  }

  /**
   * Webhook trigger. The caller has already authenticated the request; the
   * payload is still only used to find the order, then the status is re-read.
   * Throws when the status check fails so SmartGateway retries the webhook.
   */
  async handleWebhook(payload: Record<string, unknown>): Promise<void> {
    if (!this.gateway.isEnabled()) {
      return;
    }
    const content = payload.content as Record<string, unknown> | undefined;
    const gatewayOrder = content?.order as Record<string, unknown> | undefined;
    const gatewayOrderId = HdfcPaymentsService.firstString(gatewayOrder?.order_id);
    if (!gatewayOrderId) {
      this.logger.warn(`HDFC webhook ${String(payload.event_name)} had no order_id; ignored`);
      return;
    }
    const order = await this.prisma.order.findUnique({ where: { hdfcOrderId: gatewayOrderId } });
    if (!order) {
      this.logger.warn(`HDFC webhook referenced unknown order ${gatewayOrderId}; ignored`);
      return;
    }
    await this.settle(order);
  }

  /**
   * Storefront status check after the customer returns from the payment page
   * (`return_url` is the storefront result page, which must not redirect).
   */
  async resolveStatus(
    lookup: { orderId?: string; hdfcOrderId?: string },
    authorization?: string,
    guestToken?: string,
  ): Promise<Order> {
    const order = lookup.orderId
      ? await this.prisma.order.findUnique({ where: { id: lookup.orderId } })
      : lookup.hdfcOrderId
        ? await this.prisma.order.findUnique({ where: { hdfcOrderId: lookup.hdfcOrderId } })
        : null;
    if (!order?.hdfcOrderId) {
      throw new NotFoundException('Order not found');
    }
    await this.carts.requireOwnedCart(order.cartId, authorization, guestToken);
    if (order.status !== OrderStatus.PAYMENT_PENDING || !this.gateway.isEnabled()) {
      return order;
    }
    await this.settle(order);
    return (await this.prisma.order.findUnique({ where: { id: order.id } })) ?? order;
  }

  async reconcilePending(limit = 100): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      inspected: 0,
      confirmed: 0,
      failed: 0,
      pending: 0,
      errors: 0,
    };
    if (!this.gateway.isEnabled()) {
      return result;
    }
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PAYMENT_PENDING,
        hdfcOrderId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    result.inspected = orders.length;
    for (const order of orders) {
      try {
        const status = await this.settle(order);
        result[status] += 1;
      } catch {
        result.errors += 1;
      }
    }
    return result;
  }

  /** Reads the authoritative status from SmartGateway and applies it idempotently. */
  private async settle(order: Order): Promise<'confirmed' | 'failed' | 'pending'> {
    const status = await this.gateway.getOrderStatus(order);
    if (status.orderId && status.orderId !== order.hdfcOrderId) {
      throw new ConflictException('HDFC status belongs to a different order');
    }
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      if (status.outcome === 'captured' && HdfcPaymentsService.outcomeFor(order) === 'failed') {
        await this.recordLateCapture(order, status);
      }
      return HdfcPaymentsService.outcomeFor(order) === 'success' ? 'confirmed' : 'failed';
    }
    if (status.outcome === 'captured') {
      if (status.amountPaise !== order.totalPaise) {
        throw new ConflictException('HDFC charged amount does not match the local order');
      }
      await this.applyCaptured(order, status);
      return 'confirmed';
    }
    // Non-terminal statuses (NEW, PENDING_VBV, AUTHORIZING, …) stay pending until
    // the checkout window closes; a charge after that is kept as a late capture.
    if (status.outcome === 'failed' || order.paymentExpiresAt <= new Date()) {
      await this.applyFailed(order, status);
      return 'failed';
    }
    return 'pending';
  }

  private async applyCaptured(order: Order, status: HdfcOrderStatus): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.upsertCapturedPayment(transaction, order, status);
      await transaction.$executeRaw`select public.confirm_paid_order(${order.id}::uuid)`;
    });
  }

  /**
   * SmartGateway charged an order that already expired or was cancelled. Keep the
   * captured payment on record so support can refund it from the HDFC dashboard.
   */
  private async recordLateCapture(order: Order, status: HdfcOrderStatus): Promise<void> {
    try {
      await this.prisma.$transaction((transaction) =>
        this.upsertCapturedPayment(transaction, order, status),
      );
      this.logger.error(
        `HDFC charged ${status.amountPaise ?? order.totalPaise} paise for ${order.orderNumber} after it reached ${order.status}; refund it from the SmartGateway dashboard`,
      );
    } catch (error) {
      this.logger.error(
        `HDFC late capture for ${order.orderNumber} could not be recorded: ${this.describe(error)}`,
      );
    }
  }

  private async upsertCapturedPayment(
    transaction: Prisma.TransactionClient,
    order: Order,
    status: HdfcOrderStatus,
  ): Promise<void> {
    const hdfcTransactionId = status.transactionId ?? order.hdfcOrderId!;
    const existing = await transaction.payment.findUnique({
      where: { hdfcTransactionId },
      select: { orderId: true },
    });
    if (existing && existing.orderId !== order.id) {
      throw new ConflictException('HDFC payment is already linked to another order');
    }
    await transaction.payment.upsert({
      where: { hdfcTransactionId },
      create: {
        orderId: order.id,
        hdfcTransactionId,
        status: PaymentStatus.CAPTURED,
        amountPaise: status.amountPaise ?? order.totalPaise,
        currency: order.currency,
        // Server-to-server Order Status API over TLS with our API key.
        signatureVerified: true,
        method: status.paymentMethod ?? undefined,
        capturedAt: new Date(),
        rawPayload: toInputJson(status.raw),
      },
      update: {
        status: PaymentStatus.CAPTURED,
        signatureVerified: true,
        method: status.paymentMethod ?? undefined,
        capturedAt: new Date(),
        rawPayload: toInputJson(status.raw),
      },
    });
  }

  private async applyFailed(order: Order, status: HdfcOrderStatus): Promise<void> {
    const hdfcTransactionId = status.transactionId;
    await this.prisma.$transaction(async (transaction) => {
      if (hdfcTransactionId) {
        const existing = await transaction.payment.findUnique({
          where: { hdfcTransactionId },
          select: { orderId: true, status: true },
        });
        if (existing && existing.orderId !== order.id) {
          throw new ConflictException('HDFC payment is already linked to another order');
        }
        // Never downgrade a captured payment on a late failure.
        if (existing?.status !== PaymentStatus.CAPTURED) {
          await transaction.payment.upsert({
            where: { hdfcTransactionId },
            create: {
              orderId: order.id,
              hdfcTransactionId,
              status: PaymentStatus.FAILED,
              amountPaise: status.amountPaise ?? order.totalPaise,
              currency: order.currency,
              signatureVerified: true,
              method: status.paymentMethod ?? undefined,
              rawPayload: toInputJson(status.raw),
            },
            update: {
              status: PaymentStatus.FAILED,
              rawPayload: toInputJson(status.raw),
            },
          });
        }
      }
      await transaction.$executeRaw`select public.fail_pending_order(${order.id}::uuid)`;
    });
  }

  private requireEnabled(): void {
    if (!this.gateway.isEnabled()) {
      throw new ServiceUnavailableException('HDFC payment gateway is not enabled');
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  static outcomeFor(order: Pick<Order, 'status'>): HdfcResultOutcome {
    if (order.status === OrderStatus.PAYMENT_PENDING) return 'pending';
    if (order.status === OrderStatus.PAYMENT_FAILED || order.status === OrderStatus.CANCELLED) {
      return 'failed';
    }
    return 'success';
  }

  static customerFor(order: Order): HdfcCustomer {
    const address = (order.addressSnapshot ?? {}) as Record<string, unknown>;
    const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
    // SmartGateway wants a 10-digit number without the country code.
    const phone = text(address.phone).replace(/\D/g, '').slice(-10);
    // Names allow only alphanumerics and ().-_
    const names = text(address.recipientName)
      .split(/\s+/)
      .map((part) => part.replace(/[^A-Za-z0-9().\-_]/g, ''))
      .filter(Boolean);
    return {
      id: HdfcGatewayService.customerIdFor(order),
      email: text(address.email),
      phone,
      firstName: names[0],
      lastName: names.length > 1 ? names[names.length - 1] : undefined,
    };
  }

  /**
   * SmartGateway order ids must be alphanumeric, shorter than 21 characters and
   * non-sequential: "GHC" + base36 time (8) + 8 random hex characters = 19.
   */
  static newGatewayOrderId(): string {
    return `GHC${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private static firstString(value: unknown): string | null {
    const candidate = Array.isArray(value) ? value[0] : value;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
  }
}
