import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Order,
  Payment,
  PaymentStatus,
  Prisma,
  Refund,
  RefundStatus,
  ReturnStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { HdfcGatewayService, HdfcRefund } from '../payments/hdfc/hdfc-gateway.service';
import { CreateRefundDto } from './dto/create-refund.dto';

export interface RefundReconciliationResult {
  inspected: number;
  processed: number;
  pending: number;
  failed: number;
  errors: number;
}

type PaymentWithOrder = Payment & { order: Order };

/** Refunds through the HDFC SmartGateway Refund Order API. */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: HdfcGatewayService,
    private readonly audit: AuditService,
  ) {}

  async create(actorId: string | undefined, input: CreateRefundDto): Promise<Refund> {
    const existing = await this.prisma.refund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return this.requireSameRequest(existing, input);

    const refund = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`select pg_advisory_xact_lock(
          hashtextextended(${input.paymentId}::text, 0)
        )`;
        const raced = await transaction.refund.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (raced) return this.requireSameRequest(raced, input);
        const payment = await transaction.payment.findUnique({
          where: { id: input.paymentId },
          include: { order: true },
        });
        if (
          !payment ||
          (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.REFUNDED)
        ) {
          throw new NotFoundException('Captured payment not found');
        }
        this.requireGatewayOrder(payment);
        if (input.returnRequestId) {
          const request = await transaction.returnRequest.findUnique({
            where: { id: input.returnRequestId },
          });
          if (!request || request.status !== ReturnStatus.RECEIVED) {
            throw new BadRequestException('Return must be received before refund');
          }
        }
        const aggregate = await transaction.refund.aggregate({
          where: {
            paymentId: payment.id,
            status: { not: RefundStatus.FAILED },
          },
          _sum: { amountPaise: true },
        });
        if ((aggregate._sum.amountPaise ?? 0) + input.amountPaise > payment.amountPaise) {
          throw new BadRequestException('Refund exceeds the captured payment amount');
        }
        const hdfcRefundId = RefundsService.uniqueRequestId(input.idempotencyKey);
        const local = await transaction.refund.create({
          data: {
            paymentId: payment.id,
            returnRequestId: input.returnRequestId,
            idempotencyKey: input.idempotencyKey,
            hdfcRefundId,
            amountPaise: input.amountPaise,
            currency: payment.currency,
            reason: input.reason,
          },
        });
        const provider = await this.submitRefund(payment, hdfcRefundId, input.amountPaise);
        return this.persistProviderState(transaction, local, payment, provider);
      },
      { timeout: 20_000 },
    );
    await this.audit.record({
      actorId,
      action: 'refund.created',
      entityType: 'refund',
      entityId: refund.id,
      metadata: {
        paymentId: input.paymentId,
        amountPaise: input.amountPaise,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return refund;
  }

  async refundOrderCancellation(orderId: string): Promise<Refund | null> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        status: { in: [PaymentStatus.CAPTURED, PaymentStatus.REFUNDED] },
      },
      include: { order: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!payment) return null;
    if (!payment.order.hdfcOrderId) {
      // Pre-SmartGateway (Razorpay) payment; surface it instead of failing the outbox job.
      this.logger.warn(
        `Order ${orderId} was cancelled after a legacy Razorpay payment; refund it manually`,
      );
      return null;
    }
    const aggregate = await this.prisma.refund.aggregate({
      where: {
        paymentId: payment.id,
        status: { not: RefundStatus.FAILED },
      },
      _sum: { amountPaise: true },
    });
    const remaining = payment.amountPaise - (aggregate._sum.amountPaise ?? 0);
    if (remaining <= 0) return null;
    return this.create(undefined, {
      paymentId: payment.id,
      amountPaise: remaining,
      idempotencyKey: `cancel_${orderId.replaceAll('-', '_')}`,
      reason: 'Automatic pre-fulfilment order cancellation refund',
    });
  }

  async reconcilePending(limit = 100): Promise<RefundReconciliationResult> {
    const refunds = await this.prisma.refund.findMany({
      where: {
        status: RefundStatus.PENDING,
        hdfcRefundId: { not: null },
      },
      include: { payment: { include: { order: true } } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    const result: RefundReconciliationResult = {
      inspected: refunds.length,
      processed: 0,
      pending: 0,
      failed: 0,
      errors: 0,
    };
    for (const refund of refunds) {
      try {
        const status = await this.gateway.getOrderStatus(refund.payment.order);
        const provider = this.findRefund(status.refunds, refund.hdfcRefundId!, refund.amountPaise);
        if (!provider) {
          result.pending += 1;
          continue;
        }
        await this.prisma.$transaction((transaction) =>
          this.persistProviderState(transaction, refund, refund.payment, provider),
        );
        result[provider.outcome] += 1;
      } catch {
        result.errors += 1;
      }
    }
    return result;
  }

  /**
   * Submits the refund. If the call fails after SmartGateway accepted it (for
   * example a timeout, or a retry hitting the duplicate unique_request_id), the
   * refund is recovered from the Order Status API instead.
   */
  private async submitRefund(
    payment: PaymentWithOrder,
    hdfcRefundId: string,
    amountPaise: number,
  ): Promise<HdfcRefund | null> {
    try {
      const status = await this.gateway.createRefund(payment.order, hdfcRefundId, amountPaise);
      return this.findRefund(status.refunds, hdfcRefundId, amountPaise);
    } catch (error) {
      const status = await this.gateway.getOrderStatus(payment.order).catch(() => null);
      const recovered = status && this.findRefund(status.refunds, hdfcRefundId, amountPaise);
      if (recovered) return recovered;
      throw error;
    }
  }

  private findRefund(
    refunds: HdfcRefund[],
    hdfcRefundId: string,
    amountPaise: number,
  ): HdfcRefund | null {
    const refund = refunds.find((entry) => entry.uniqueRequestId === hdfcRefundId);
    if (!refund) return null;
    if (refund.amountPaise !== null && refund.amountPaise !== amountPaise) {
      throw new BadRequestException('HDFC refund does not match the request');
    }
    return refund;
  }

  private requireGatewayOrder(payment: PaymentWithOrder): void {
    if (!payment.order.hdfcOrderId) {
      throw new BadRequestException(
        'Refunds for legacy Razorpay payments must be processed manually',
      );
    }
  }

  private requireSameRequest(refund: Refund, input: CreateRefundDto): Refund {
    if (
      refund.paymentId !== input.paymentId ||
      refund.returnRequestId !== (input.returnRequestId ?? null) ||
      refund.amountPaise !== input.amountPaise ||
      (refund.reason ?? null) !== (input.reason ?? null)
    ) {
      throw new ConflictException(
        'Idempotency key was already used for a different refund request',
      );
    }
    return refund;
  }

  /** `provider` is null while SmartGateway has not listed the refund yet. */
  private async persistProviderState(
    transaction: Prisma.TransactionClient,
    refund: Refund,
    payment: Payment,
    provider: HdfcRefund | null,
  ): Promise<Refund> {
    const status = this.status(provider);
    const saved = await transaction.refund.update({
      where: { id: refund.id },
      data: {
        status,
        rawPayload: provider ? this.json(provider.raw) : undefined,
        processedAt: status === RefundStatus.PROCESSED ? new Date() : undefined,
      },
    });
    if (refund.returnRequestId) {
      if (status === RefundStatus.PROCESSED) {
        await transaction.returnRequest.update({
          where: { id: refund.returnRequestId },
          data: { status: ReturnStatus.REFUNDED },
        });
      } else if (status === RefundStatus.PENDING) {
        await transaction.returnRequest.updateMany({
          where: {
            id: refund.returnRequestId,
            status: ReturnStatus.RECEIVED,
          },
          data: { status: ReturnStatus.REFUND_PENDING },
        });
      } else {
        await transaction.returnRequest.updateMany({
          where: {
            id: refund.returnRequestId,
            status: ReturnStatus.REFUND_PENDING,
          },
          data: { status: ReturnStatus.RECEIVED },
        });
      }
    }
    if (status === RefundStatus.PROCESSED) {
      const aggregate = await transaction.refund.aggregate({
        where: {
          paymentId: payment.id,
          status: RefundStatus.PROCESSED,
        },
        _sum: { amountPaise: true },
      });
      if ((aggregate._sum.amountPaise ?? 0) >= payment.amountPaise) {
        await transaction.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }
    }
    return saved;
  }

  private status(provider: HdfcRefund | null): RefundStatus {
    if (provider?.outcome === 'processed') return RefundStatus.PROCESSED;
    if (provider?.outcome === 'failed') return RefundStatus.FAILED;
    return RefundStatus.PENDING;
  }

  private json(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  /**
   * SmartGateway `unique_request_id`: under 21 characters and stable for an
   * idempotency key, so a retried request can never refund twice.
   */
  static uniqueRequestId(idempotencyKey: string): string {
    return `R${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 19).toUpperCase()}`;
  }
}
