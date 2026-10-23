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

interface RefundState {
  status: RefundStatus;
  raw?: object;
}

/**
 * A pending refund that SmartGateway still does not list after this long was
 * never received by it, so it is submitted again under the same
 * `unique_request_id` (which SmartGateway refuses to refund twice).
 */
const RESUBMIT_AFTER_MS = 2 * 60 * 1000;

/** HTTP statuses that do not prove SmartGateway rejected the request. */
const AMBIGUOUS_CLIENT_ERRORS = new Set([408, 409, 425, 429]);

/** Refunds through the HDFC SmartGateway Refund Order API. */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: HdfcGatewayService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Three steps, so the money movement never happens inside a database
   * transaction that could roll back after HDFC refunded:
   * 1. a short transaction validates and commits a PENDING refund row;
   * 2. SmartGateway is called with no transaction open;
   * 3. a short transaction records what SmartGateway reported.
   * If step 2 has no definite answer the PENDING row stays for
   * `reconcilePending` (or a retry with the same idempotency key) to settle.
   */
  async create(actorId: string | undefined, input: CreateRefundDto): Promise<Refund> {
    const existing = await this.prisma.refund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return this.resume(this.requireSameRequest(existing, input));

    const opened = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(
        hashtextextended(${input.paymentId}::text, 0)
      )`;
      const raced = await transaction.refund.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raced) return { refund: this.requireSameRequest(raced, input), payment: null };
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
        if (!request || request.orderId !== payment.orderId) {
          throw new BadRequestException('Return request does not belong to this payment');
        }
        if (request.status !== ReturnStatus.RECEIVED) {
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
      const refund = await transaction.refund.create({
        data: {
          paymentId: payment.id,
          returnRequestId: input.returnRequestId,
          idempotencyKey: input.idempotencyKey,
          hdfcRefundId: RefundsService.uniqueRequestId(input.idempotencyKey),
          amountPaise: input.amountPaise,
          currency: payment.currency,
          reason: input.reason,
        },
      });
      if (input.returnRequestId) {
        await transaction.returnRequest.updateMany({
          where: { id: input.returnRequestId, status: ReturnStatus.RECEIVED },
          data: { status: ReturnStatus.REFUND_PENDING },
        });
      }
      return { refund, payment };
    });
    if (!opened.payment) return this.resume(opened.refund);

    await this.audit.record({
      actorId,
      action: 'refund.created',
      entityType: 'refund',
      entityId: opened.refund.id,
      metadata: {
        paymentId: input.paymentId,
        amountPaise: input.amountPaise,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return this.dispatch(opened.refund, opened.payment, true);
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
    const idempotencyKey = `cancel_${orderId.replaceAll('-', '_')}`;
    // A retried outbox job settles the refund it already opened instead of sizing a new one.
    const opened = await this.prisma.refund.findUnique({ where: { idempotencyKey } });
    if (opened) return this.resume(opened);
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
      idempotencyKey,
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
    for (const { payment, ...refund } of refunds) {
      try {
        const settled = await this.advance(refund, payment);
        if (settled.status === RefundStatus.PROCESSED) result.processed += 1;
        else if (settled.status === RefundStatus.FAILED) result.failed += 1;
        else result.pending += 1;
      } catch (error) {
        this.logger.warn(`Refund ${refund.id} could not be reconciled: ${this.message(error)}`);
        result.errors += 1;
      }
    }
    return result;
  }

  /** Settles a PENDING refund from the Order Status API, resubmitting it if HDFC never saw it. */
  private async advance(refund: Refund, payment: PaymentWithOrder): Promise<Refund> {
    const status = await this.gateway.getOrderStatus(payment.order);
    const listed = this.findRefund(status.refunds, refund.hdfcRefundId!, refund.amountPaise);
    if (listed) return this.settle(refund, payment, this.providerState(listed));
    if (Date.now() - refund.createdAt.getTime() < RESUBMIT_AFTER_MS) return refund;
    return this.dispatch(refund, payment, false);
  }

  /** Re-entry for a retried idempotency key: settle the existing row, never open a new one. */
  private async resume(refund: Refund): Promise<Refund> {
    if (refund.status !== RefundStatus.PENDING || !refund.hdfcRefundId) return refund;
    const payment = await this.prisma.payment.findUnique({
      where: { id: refund.paymentId },
      include: { order: true },
    });
    if (!payment?.order.hdfcOrderId) return refund;
    try {
      return await this.advance(refund, payment);
    } catch (error) {
      this.logger.warn(`Refund ${refund.id} is still unsettled: ${this.message(error)}`);
      return refund;
    }
  }

  /**
   * Calls SmartGateway with no transaction open. Only a definite rejection of
   * the first submission marks the refund failed; any other error keeps it
   * PENDING because the money may already have moved.
   */
  private async dispatch(
    refund: Refund,
    payment: PaymentWithOrder,
    firstAttempt: boolean,
  ): Promise<Refund> {
    let provider: HdfcRefund | null;
    try {
      provider = await this.submitRefund(payment, refund.hdfcRefundId!, refund.amountPaise);
    } catch (error) {
      if (firstAttempt && RefundsService.isDefinitiveRejection(error)) {
        await this.settle(refund, payment, {
          status: RefundStatus.FAILED,
          raw: { error: this.message(error) },
        });
        throw error;
      }
      this.logger.warn(
        `Refund ${refund.id} outcome is unknown and will be reconciled: ${this.message(error)}`,
      );
      return refund;
    }
    return this.settle(refund, payment, this.providerState(provider));
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

  private settle(refund: Refund, payment: Payment, state: RefundState): Promise<Refund> {
    return this.prisma.$transaction((transaction) =>
      this.persistState(transaction, refund, payment, state),
    );
  }

  /**
   * Only a PENDING row moves, so a refund settled concurrently (by the
   * reconciler or a retried request) is never overwritten or regressed.
   */
  private async persistState(
    transaction: Prisma.TransactionClient,
    refund: Refund,
    payment: Payment,
    { status, raw }: RefundState,
  ): Promise<Refund> {
    const { count } = await transaction.refund.updateMany({
      where: { id: refund.id, status: RefundStatus.PENDING },
      data: {
        status,
        rawPayload: raw ? this.json(raw) : undefined,
        processedAt: status === RefundStatus.PROCESSED ? new Date() : undefined,
      },
    });
    const saved = await transaction.refund.findUniqueOrThrow({ where: { id: refund.id } });
    if (!count) return saved;
    if (refund.returnRequestId) {
      if (status === RefundStatus.PROCESSED) {
        await transaction.returnRequest.updateMany({
          where: {
            id: refund.returnRequestId,
            status: { in: [ReturnStatus.RECEIVED, ReturnStatus.REFUND_PENDING] },
          },
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

  /** `provider` is null while SmartGateway has not listed the refund yet. */
  private providerState(provider: HdfcRefund | null): RefundState {
    if (provider?.outcome === 'processed') {
      return { status: RefundStatus.PROCESSED, raw: provider.raw };
    }
    if (provider?.outcome === 'failed') return { status: RefundStatus.FAILED, raw: provider.raw };
    return { status: RefundStatus.PENDING, raw: provider?.raw };
  }

  private json(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }

  /**
   * True only when SmartGateway answered with a client error (so it did not
   * refund), or the request was never sent because HDFC is not configured.
   */
  static isDefinitiveRejection(error: unknown): boolean {
    const message = error instanceof Error ? error.message : '';
    if (/HDFC gateway is not configured/.test(message)) return true;
    const status = /failed with HTTP (\d{3})\b/.exec(message)?.[1];
    if (!status) return false;
    const code = Number(status);
    return code >= 400 && code < 500 && !AMBIGUOUS_CLIENT_ERRORS.has(code);
  }

  /**
   * SmartGateway `unique_request_id`: under 21 characters and stable for an
   * idempotency key, so a retried request can never refund twice.
   */
  static uniqueRequestId(idempotencyKey: string): string {
    return `R${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 19).toUpperCase()}`;
  }
}
