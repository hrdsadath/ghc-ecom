import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Order, OrderStatus, PaymentStatus, QuoteStatus } from '@prisma/client';
import { CartService } from '../../cart/cart.service';
import { PrismaService } from '../../database/prisma.service';
import { HdfcGatewayService, HdfcOrderStatus } from './hdfc-gateway.service';
import { HdfcPaymentsService } from './hdfc-payments.service';

describe('HdfcPaymentsService', () => {
  const quote = {
    id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    cartId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    userId: null,
    couponId: null,
    status: QuoteStatus.ACTIVE,
    currency: 'INR',
    itemsSnapshot: [{ sku: 'SKU-1', quantity: 1 }],
    addressSnapshot: {
      email: 'buyer@example.com',
      recipientName: 'Asha K. Menon',
      phone: '+91 98765-43210',
      city: 'Pune',
    },
    subtotalPaise: 10_000,
    discountPaise: 0,
    shippingPaise: 900,
    taxPaise: 1_800,
    totalPaise: 12_700,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  };
  const pendingOrder = {
    id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    orderNumber: 'GHC-TEST-1',
    quoteId: quote.id,
    cartId: quote.cartId,
    userId: null,
    couponId: null,
    status: OrderStatus.PAYMENT_PENDING,
    currency: 'INR',
    itemsSnapshot: quote.itemsSnapshot,
    addressSnapshot: quote.addressSnapshot,
    subtotalPaise: quote.subtotalPaise,
    discountPaise: quote.discountPaise,
    shippingPaise: quote.shippingPaise,
    taxPaise: quote.taxPaise,
    totalPaise: quote.totalPaise,
    hdfcOrderId: 'GHCMF0ABCDE12345678',
    paymentExpiresAt: quote.expiresAt,
    confirmedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Order;
  const charged: HdfcOrderStatus = {
    orderId: pendingOrder.hdfcOrderId!,
    status: 'CHARGED',
    statusId: 21,
    outcome: 'captured',
    amountPaise: pendingOrder.totalPaise,
    transactionId: 'txn-uuid-1',
    paymentMethod: 'UPI',
    errorMessage: null,
    refunds: [],
    raw: { status: 'CHARGED' },
  };

  let prisma: {
    checkoutQuote: { findUnique: jest.Mock };
    order: { findUnique: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let transaction: {
    $executeRaw: jest.Mock;
    order: { findUnique: jest.Mock; create: jest.Mock };
    payment: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let carts: { requireAccessibleCart: jest.Mock; requireOwnedCart: jest.Mock };
  let gateway: { isEnabled: jest.Mock; createSession: jest.Mock; getOrderStatus: jest.Mock };
  let service: HdfcPaymentsService;

  beforeEach(() => {
    transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      order: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      payment: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    };
    prisma = {
      checkoutQuote: { findUnique: jest.fn().mockResolvedValue(quote) },
      order: {
        findUnique: jest.fn().mockResolvedValue(pendingOrder),
        findMany: jest.fn().mockResolvedValue([pendingOrder]),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    carts = {
      requireAccessibleCart: jest.fn().mockResolvedValue(undefined),
      requireOwnedCart: jest.fn().mockResolvedValue(undefined),
    };
    gateway = {
      isEnabled: jest.fn().mockReturnValue(true),
      createSession: jest.fn().mockResolvedValue({
        id: 'ordeh_1',
        orderId: pendingOrder.hdfcOrderId,
        status: 'NEW',
        paymentUrl: 'https://smartgateway.hdfcuat.bank.in/orders/ordeh_1/payment-page',
        expiresAt: null,
      }),
      getOrderStatus: jest.fn().mockResolvedValue(charged),
    };
    service = new HdfcPaymentsService(
      prisma as unknown as PrismaService,
      carts as unknown as CartService,
      gateway as unknown as HdfcGatewayService,
    );
  });

  describe('createIntent', () => {
    it('creates an HDFC order and returns the hosted payment page link', async () => {
      transaction.order.create.mockImplementation(({ data }) => ({ ...pendingOrder, ...data }));

      const intent = await service.createIntent({ quoteId: quote.id }, undefined, 'guest-token');

      expect(carts.requireAccessibleCart).toHaveBeenCalledWith(
        quote.cartId,
        undefined,
        'guest-token',
      );
      const { data } = transaction.order.create.mock.calls[0][0];
      expect(data.hdfcOrderId).toMatch(/^[A-Z0-9]{1,20}$/);
      expect(gateway.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ hdfcOrderId: data.hdfcOrderId }),
        {
          id: `guest${data.hdfcOrderId}`,
          email: 'buyer@example.com',
          phone: '9876543210',
          firstName: 'Asha',
          lastName: 'Menon',
        },
      );
      expect(intent).toMatchObject({
        provider: 'hdfc',
        hdfcOrderId: data.hdfcOrderId,
        amount: quote.totalPaise,
        paymentUrl: 'https://smartgateway.hdfcuat.bank.in/orders/ordeh_1/payment-page',
      });
    });

    it('reuses the HDFC order already created for the quote', async () => {
      transaction.order.findUnique.mockResolvedValue(pendingOrder);

      const intent = await service.createIntent({ quoteId: quote.id });

      expect(transaction.order.create).not.toHaveBeenCalled();
      expect(intent.hdfcOrderId).toBe(pendingOrder.hdfcOrderId);
    });

    it('refuses a quote that belongs to a legacy Razorpay order', async () => {
      transaction.order.findUnique.mockResolvedValue({ ...pendingOrder, hdfcOrderId: null });

      await expect(service.createIntent({ quoteId: quote.id })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(gateway.createSession).not.toHaveBeenCalled();
    });

    it('does not reopen payment for an order that is no longer pending', async () => {
      transaction.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        status: OrderStatus.PAYMENT_FAILED,
      });

      await expect(service.createIntent({ quoteId: quote.id })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('is unavailable while the gateway is disabled', async () => {
      gateway.isEnabled.mockReturnValue(false);

      await expect(service.createIntent({ quoteId: quote.id })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('resolveStatus', () => {
    it('confirms a CHARGED order found by the SmartGateway order id', async () => {
      prisma.order.findUnique
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce({ ...pendingOrder, status: OrderStatus.CONFIRMED });

      const order = await service.resolveStatus(
        { hdfcOrderId: pendingOrder.hdfcOrderId! },
        undefined,
        'guest-token',
      );

      expect(prisma.order.findUnique).toHaveBeenNthCalledWith(1, {
        where: { hdfcOrderId: pendingOrder.hdfcOrderId },
      });
      expect(carts.requireOwnedCart).toHaveBeenCalledWith(
        pendingOrder.cartId,
        undefined,
        'guest-token',
      );
      expect(transaction.payment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hdfcTransactionId: 'txn-uuid-1' },
          create: expect.objectContaining({
            status: PaymentStatus.CAPTURED,
            amountPaise: pendingOrder.totalPaise,
            signatureVerified: true,
          }),
        }),
      );
      expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
      expect(order.status).toBe(OrderStatus.CONFIRMED);
    });

    it('refuses to confirm when the charged amount differs', async () => {
      gateway.getOrderStatus.mockResolvedValue({ ...charged, amountPaise: 100 });

      await expect(service.resolveStatus({ orderId: pendingOrder.id })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(transaction.payment.upsert).not.toHaveBeenCalled();
    });

    it('refuses a status response for a different gateway order', async () => {
      gateway.getOrderStatus.mockResolvedValue({ ...charged, orderId: 'GHCOTHER' });

      await expect(service.resolveStatus({ orderId: pendingOrder.id })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('fails the order on an explicit decline', async () => {
      gateway.getOrderStatus.mockResolvedValue({
        ...charged,
        status: 'AUTHORIZATION_FAILED',
        outcome: 'failed',
      });

      await service.resolveStatus({ orderId: pendingOrder.id });

      expect(transaction.payment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: PaymentStatus.FAILED }),
        }),
      );
      expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('leaves a non-terminal order pending inside the payment window', async () => {
      gateway.getOrderStatus.mockResolvedValue({
        ...charged,
        status: 'PENDING_VBV',
        outcome: 'pending',
        transactionId: null,
      });

      await service.resolveStatus({ orderId: pendingOrder.id });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails an order the customer left without attempting a payment (NEW)', async () => {
      gateway.getOrderStatus.mockResolvedValue({
        ...charged,
        status: 'NEW',
        outcome: 'pending',
        transactionId: null,
      });

      await service.resolveStatus({ orderId: pendingOrder.id });

      expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('does not expose legacy Razorpay orders', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...pendingOrder, hdfcOrderId: null });

      await expect(service.resolveStatus({ orderId: pendingOrder.id })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(gateway.getOrderStatus).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    it('re-reads the order status instead of trusting the payload', async () => {
      gateway.getOrderStatus.mockResolvedValue({ ...charged, status: 'NEW', outcome: 'pending' });

      await service.handleWebhook({
        event_name: 'ORDER_SUCCEEDED',
        content: { order: { order_id: pendingOrder.hdfcOrderId, status: 'CHARGED' } },
      });

      expect(gateway.getOrderStatus).toHaveBeenCalledWith(pendingOrder);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ignores webhooks for unknown orders so they are not retried forever', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.handleWebhook({ content: { order: { order_id: 'GHCUNKNOWN' } } }),
      ).resolves.toBeUndefined();
      expect(gateway.getOrderStatus).not.toHaveBeenCalled();
    });

    it('propagates status failures so SmartGateway retries the webhook', async () => {
      gateway.getOrderStatus.mockRejectedValue(new Error('timeout'));

      await expect(
        service.handleWebhook({ content: { order: { order_id: pendingOrder.hdfcOrderId } } }),
      ).rejects.toThrow('timeout');
    });

    it('records a late capture on an already failed order without reconfirming it', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...pendingOrder,
        status: OrderStatus.PAYMENT_FAILED,
      });

      await service.handleWebhook({ content: { order: { order_id: pendingOrder.hdfcOrderId } } });

      expect(transaction.payment.upsert).toHaveBeenCalledTimes(1);
      expect(transaction.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('reconcilePending', () => {
    it('fails expired orders that never completed', async () => {
      prisma.order.findMany.mockResolvedValue([
        { ...pendingOrder, paymentExpiresAt: new Date(Date.now() - 1_000) },
      ]);
      gateway.getOrderStatus.mockResolvedValue({
        ...charged,
        status: 'NEW',
        outcome: 'pending',
        transactionId: null,
      });

      await expect(service.reconcilePending()).resolves.toEqual({
        inspected: 1,
        confirmed: 0,
        failed: 1,
        pending: 0,
        errors: 0,
      });
      expect(transaction.payment.upsert).not.toHaveBeenCalled();
      expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('counts gateway errors without stopping the batch', async () => {
      prisma.order.findMany.mockResolvedValue([pendingOrder, pendingOrder]);
      gateway.getOrderStatus.mockRejectedValueOnce(new Error('down')).mockResolvedValue(charged);

      await expect(service.reconcilePending()).resolves.toMatchObject({
        inspected: 2,
        confirmed: 1,
        errors: 1,
      });
    });
  });

  it('generates SmartGateway-compliant order ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => HdfcPaymentsService.newGatewayOrderId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Z0-9]{1,20}$/);
  });
});
