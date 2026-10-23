import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentStatus, RefundStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { HdfcGatewayService, HdfcRefund } from '../payments/hdfc/hdfc-gateway.service';
import { RefundsService } from './refunds.service';

describe('RefundsService', () => {
  const order = {
    id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    userId: null,
    hdfcOrderId: 'GHCMF0ABCDE12345678',
  };
  const payment = {
    id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    orderId: order.id,
    hdfcTransactionId: 'txn-uuid-1',
    status: PaymentStatus.CAPTURED,
    amountPaise: 10_000,
    currency: 'INR',
    order,
  };
  const providerRefund = (
    uniqueRequestId: string,
    amountPaise: number,
    status = 'SUCCESS',
  ): HdfcRefund => ({
    uniqueRequestId,
    status,
    outcome: status === 'SUCCESS' ? 'processed' : status === 'FAILURE' ? 'failed' : 'pending',
    amountPaise,
    reference: 'rfnd_ref',
    raw: { unique_request_id: uniqueRequestId, status },
  });
  const local: {
    id: string;
    paymentId: string;
    idempotencyKey: string;
    amountPaise: number;
    status: RefundStatus;
    returnRequestId: string | null;
    reason: string | null;
    hdfcRefundId: string;
    createdAt: Date;
  } = {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    paymentId: payment.id,
    idempotencyKey: 'refund_key_123',
    amountPaise: 4_000,
    status: RefundStatus.PENDING,
    returnRequestId: null,
    reason: null,
    hdfcRefundId: RefundsService.uniqueRequestId('refund_key_123'),
    createdAt: new Date(),
  };
  let savedRefund: typeof local | null;
  let transaction: {
    $executeRaw: jest.Mock;
    refund: {
      findUnique: jest.Mock;
      aggregate: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    payment: { findUnique: jest.Mock; update: jest.Mock };
    returnRequest: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let prisma: {
    refund: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      aggregate: jest.Mock;
    };
    payment: { findFirst: jest.Mock; findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let gateway: { createRefund: jest.Mock; getOrderStatus: jest.Mock };
  let audit: { record: jest.Mock };
  let service: RefundsService;

  beforeEach(() => {
    savedRefund = null;
    transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      refund: {
        findUnique: jest.fn(() => Promise.resolve(savedRefund)),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountPaise: 0 } }),
        create: jest.fn().mockImplementation(({ data }: { data: Partial<typeof local> }) => {
          savedRefund = {
            ...local,
            idempotencyKey: data.idempotencyKey ?? local.idempotencyKey,
            hdfcRefundId: data.hdfcRefundId ?? local.hdfcRefundId,
            amountPaise: data.amountPaise ?? local.amountPaise,
            returnRequestId: data.returnRequestId ?? null,
          };
          return Promise.resolve(savedRefund);
        }),
        updateMany: jest.fn().mockImplementation(({ data }: { data: { status: RefundStatus } }) => {
          savedRefund = { ...(savedRefund ?? local), status: data.status };
          return Promise.resolve({ count: 1 });
        }),
        findUniqueOrThrow: jest.fn(() => Promise.resolve(savedRefund ?? local)),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn().mockResolvedValue({}),
      },
      returnRequest: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = {
      refund: {
        findUnique: jest.fn(() => Promise.resolve(savedRefund)),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amountPaise: 0 },
        }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(payment),
        findUnique: jest.fn().mockResolvedValue(payment),
      },
      $transaction: jest.fn((callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    gateway = {
      createRefund: jest.fn((_order: unknown, uniqueRequestId: string, amountPaise: number) =>
        Promise.resolve({ refunds: [providerRefund(uniqueRequestId, amountPaise)] }),
      ),
      getOrderStatus: jest.fn().mockResolvedValue({ refunds: [] }),
    };
    audit = { record: jest.fn().mockResolvedValue({}) };
    service = new RefundsService(
      prisma as unknown as PrismaService,
      gateway as unknown as HdfcGatewayService,
      audit as unknown as AuditService,
    );
  });

  it('creates exactly one provider refund for an idempotency key', async () => {
    const input = {
      paymentId: payment.id,
      amountPaise: 4_000,
      idempotencyKey: 'refund_key_123',
    };
    const first = await service.create('admin-1', input);
    const second = await service.create('admin-1', input);

    expect(first.id).toBe(local.id);
    expect(second.id).toBe(local.id);
    expect(gateway.createRefund).toHaveBeenCalledTimes(1);
    const uniqueRequestId = RefundsService.uniqueRequestId('refund_key_123');
    expect(uniqueRequestId).toMatch(/^[A-Z0-9]{20}$/);
    expect(gateway.createRefund).toHaveBeenCalledWith(order, uniqueRequestId, 4_000);
    expect(transaction.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hdfcRefundId: uniqueRequestId }),
    });
  });

  it('rejects cumulative partial refunds above the captured amount', async () => {
    transaction.refund.aggregate.mockResolvedValue({ _sum: { amountPaise: 8_000 } });

    await expect(
      service.create('admin-1', {
        paymentId: payment.id,
        amountPaise: 3_000,
        idempotencyKey: 'refund_key_456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.createRefund).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    savedRefund = local;

    await expect(
      service.create('admin-1', {
        paymentId: payment.id,
        amountPaise: 3_000,
        idempotencyKey: local.idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.createRefund).not.toHaveBeenCalled();
  });

  it('recovers a refund SmartGateway accepted before the call failed', async () => {
    const uniqueRequestId = RefundsService.uniqueRequestId('refund_timeout_1');
    gateway.createRefund.mockRejectedValue(new Error('timeout'));
    gateway.getOrderStatus.mockResolvedValue({
      refunds: [providerRefund(uniqueRequestId, 4_000, 'PENDING')],
    });

    await service.create('admin-1', {
      paymentId: payment.id,
      amountPaise: 4_000,
      idempotencyKey: 'refund_timeout_1',
    });

    expect(transaction.refund.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: RefundStatus.PENDING }) }),
    );
  });

  it('marks a refund SmartGateway definitely rejected as failed and rethrows', async () => {
    gateway.createRefund.mockRejectedValue(new Error('HDFC POST orders failed with HTTP 400'));

    await expect(
      service.create('admin-1', {
        paymentId: payment.id,
        amountPaise: 4_000,
        idempotencyKey: 'refund_rejected_1',
      }),
    ).rejects.toThrow('HTTP 400');
    expect(transaction.refund.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: local.id, status: RefundStatus.PENDING },
        data: expect.objectContaining({ status: RefundStatus.FAILED }),
      }),
    );
  });

  it('calls SmartGateway only after the PENDING row is committed, outside any transaction', async () => {
    let open = 0;
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof transaction) => Promise<unknown>) => {
        open += 1;
        try {
          return await callback(transaction);
        } finally {
          open -= 1;
        }
      },
    );
    gateway.createRefund.mockImplementation(
      (_order: unknown, uniqueRequestId: string, amountPaise: number) => {
        expect(open).toBe(0);
        expect(transaction.refund.create).toHaveBeenCalledTimes(1);
        return Promise.resolve({ refunds: [providerRefund(uniqueRequestId, amountPaise)] });
      },
    );

    await service.create('admin-1', {
      paymentId: payment.id,
      amountPaise: 4_000,
      idempotencyKey: 'refund_key_123',
    });

    expect(gateway.createRefund).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('keeps an unconfirmed refund PENDING when the HDFC outcome is unknown', async () => {
    transaction.returnRequest.findUnique.mockResolvedValue({
      id: 'b3a1b0de-2b0e-4b1f-9d43-3f1f0c0c7a11',
      orderId: order.id,
      status: 'RECEIVED',
    });
    gateway.createRefund.mockRejectedValue(new Error('HDFC request failed: aborted'));

    const refund = await service.create('admin-1', {
      paymentId: payment.id,
      returnRequestId: 'b3a1b0de-2b0e-4b1f-9d43-3f1f0c0c7a11',
      amountPaise: 4_000,
      idempotencyKey: 'refund_key_123',
    });

    expect(refund.status).toBe(RefundStatus.PENDING);
    expect(transaction.refund.updateMany).not.toHaveBeenCalled();
    // The return leaves RECEIVED in the first transaction so it cannot be refunded twice.
    expect(transaction.returnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'b3a1b0de-2b0e-4b1f-9d43-3f1f0c0c7a11', status: 'RECEIVED' },
      data: { status: 'REFUND_PENDING' },
    });
  });

  it('rejects a return request that belongs to a different order', async () => {
    transaction.returnRequest.findUnique.mockResolvedValue({
      id: 'b3a1b0de-2b0e-4b1f-9d43-3f1f0c0c7a11',
      orderId: 'another-order',
      status: 'RECEIVED',
    });

    await expect(
      service.create('admin-1', {
        paymentId: payment.id,
        returnRequestId: 'b3a1b0de-2b0e-4b1f-9d43-3f1f0c0c7a11',
        amountPaise: 4_000,
        idempotencyKey: 'refund_key_123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.refund.create).not.toHaveBeenCalled();
    expect(gateway.createRefund).not.toHaveBeenCalled();
  });

  it('resubmits a stale PENDING refund under the same unique_request_id on retry', async () => {
    savedRefund = { ...local, createdAt: new Date(Date.now() - 10 * 60 * 1000) };

    const refund = await service.create('admin-1', {
      paymentId: payment.id,
      amountPaise: 4_000,
      idempotencyKey: local.idempotencyKey,
    });

    expect(gateway.getOrderStatus).toHaveBeenCalledTimes(1);
    expect(gateway.createRefund).toHaveBeenCalledWith(order, local.hdfcRefundId, 4_000);
    expect(transaction.refund.create).not.toHaveBeenCalled();
    expect(refund.status).toBe(RefundStatus.PROCESSED);
  });

  it('does not resubmit a fresh PENDING refund that may still be in flight', async () => {
    savedRefund = local;

    const refund = await service.create('admin-1', {
      paymentId: payment.id,
      amountPaise: 4_000,
      idempotencyKey: local.idempotencyKey,
    });

    expect(gateway.createRefund).not.toHaveBeenCalled();
    expect(refund.status).toBe(RefundStatus.PENDING);
  });

  it('never overwrites a refund another worker already settled', async () => {
    transaction.refund.updateMany.mockResolvedValue({ count: 0 });

    await service.create('admin-1', {
      paymentId: payment.id,
      amountPaise: 10_000,
      idempotencyKey: 'refund_full_123',
    });

    expect(transaction.payment.update).not.toHaveBeenCalled();
    expect(transaction.returnRequest.updateMany).not.toHaveBeenCalled();
  });

  it('classifies only HDFC client errors as definite rejections', () => {
    expect(RefundsService.isDefinitiveRejection(new Error('failed with HTTP 400 (x)'))).toBe(true);
    expect(RefundsService.isDefinitiveRejection(new Error('failed with HTTP 429'))).toBe(false);
    expect(RefundsService.isDefinitiveRejection(new Error('failed with HTTP 502'))).toBe(false);
    expect(RefundsService.isDefinitiveRejection(new Error('HDFC request failed: aborted'))).toBe(
      false,
    );
  });

  it('reconciles a pending refund from the Order Status API', async () => {
    prisma.refund.findMany.mockResolvedValue([
      {
        ...local,
        hdfcRefundId: 'RREFUND1',
        payment,
      },
    ]);
    gateway.getOrderStatus.mockResolvedValue({ refunds: [providerRefund('RREFUND1', 4_000)] });

    await expect(service.reconcilePending()).resolves.toEqual({
      inspected: 1,
      processed: 1,
      pending: 0,
      failed: 0,
      errors: 0,
    });
    expect(transaction.refund.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: local.id, status: RefundStatus.PENDING },
        data: expect.objectContaining({ status: RefundStatus.PROCESSED }),
      }),
    );
  });

  it('resubmits a stale pending refund SmartGateway never received while reconciling', async () => {
    prisma.refund.findMany.mockResolvedValue([
      {
        ...local,
        hdfcRefundId: 'RREFUND2',
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
        payment,
      },
    ]);

    await expect(service.reconcilePending()).resolves.toEqual({
      inspected: 1,
      processed: 1,
      pending: 0,
      failed: 0,
      errors: 0,
    });
    expect(gateway.createRefund).toHaveBeenCalledWith(order, 'RREFUND2', 4_000);
  });

  it('marks a fully processed payment refunded from the trusted API response', async () => {
    transaction.refund.aggregate
      .mockResolvedValueOnce({ _sum: { amountPaise: 0 } })
      .mockResolvedValueOnce({ _sum: { amountPaise: 10_000 } });
    await service.create('admin-1', {
      paymentId: payment.id,
      amountPaise: 10_000,
      idempotencyKey: 'refund_full_123',
    });

    expect(transaction.payment.update).toHaveBeenCalledWith({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED },
    });
  });

  it('automatically refunds only the remaining captured amount after cancellation', async () => {
    prisma.refund.aggregate.mockResolvedValue({
      _sum: { amountPaise: 2_000 },
    });
    const create = jest.spyOn(service, 'create').mockResolvedValue(local as never);

    await service.refundOrderCancellation('1b4e28ba-2fa1-11d2-883f-0016d3cca427');

    expect(create).toHaveBeenCalledWith(undefined, {
      paymentId: payment.id,
      amountPaise: 8_000,
      idempotencyKey: 'cancel_1b4e28ba_2fa1_11d2_883f_0016d3cca427',
      reason: 'Automatic pre-fulfilment order cancellation refund',
    });
  });

  it('skips automatic refunds for legacy Razorpay payments', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      ...payment,
      hdfcTransactionId: null,
      order: { ...order, hdfcOrderId: null },
    });
    const create = jest.spyOn(service, 'create');

    await expect(
      service.refundOrderCancellation('1b4e28ba-2fa1-11d2-883f-0016d3cca427'),
    ).resolves.toBeNull();

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects refunds for legacy Razorpay payments', async () => {
    transaction.payment.findUnique.mockResolvedValue({
      ...payment,
      hdfcTransactionId: null,
      order: { ...order, hdfcOrderId: null },
    });

    await expect(
      service.create('admin-1', {
        paymentId: payment.id,
        amountPaise: 1_000,
        idempotencyKey: 'refund_legacy_1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.createRefund).not.toHaveBeenCalled();
  });
});
