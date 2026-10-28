import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppRole, OrderStatus } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { FulfilmentController } from '../fulfilment/fulfilment.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { InvoiceService } from './invoice.service';
import { OrdersService } from './orders.service';
import { CartService } from '../cart/cart.service';

describe('OrdersService', () => {
  const order = {
    id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    userId: '0f8fad5b-d9cb-469f-a165-70867728950e',
    orderNumber: 'GHC-1',
    status: OrderStatus.CONFIRMED,
    invoice: null,
    payments: [],
  };
  let prisma: {
    order: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let invoices: { signedUrl: jest.Mock; ensure: jest.Mock };
  let carts: { assertCartOwner: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([order]),
        findFirst: jest.fn().mockResolvedValue(order),
        findUnique: jest.fn().mockResolvedValue(order),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...order, status: OrderStatus.PROCESSING }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: order.id, item_count: 2 }]),
    };
    audit = { record: jest.fn().mockResolvedValue({}) };
    invoices = {
      signedUrl: jest.fn().mockResolvedValue('https://signed.example/invoice'),
      ensure: jest.fn().mockResolvedValue({ storagePath: 'invoices/generated.pdf' }),
    };
    carts = { assertCartOwner: jest.fn().mockResolvedValue(undefined) };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      invoices as unknown as InvoiceService,
      carts as unknown as CartService,
    );
  });

  it('allows a guest to retrieve only an order belonging to their cart token', async () => {
    const guestOrder = { ...order, userId: null, cartId: 'guest-cart' };
    const cart = { userId: null, guestTokenHash: 'hash', status: 'ACTIVE', expiresAt: new Date() };
    prisma.order.findUnique.mockResolvedValue({
      ...guestOrder,
      quote: { cartId: 'guest-cart', cart },
    });

    // The cart owner columns are read with the order and never returned to the caller.
    await expect(service.getGuest(guestOrder.id, 'guest-token')).resolves.toEqual(guestOrder);
    expect(carts.assertCartOwner).toHaveBeenCalledWith(cart, undefined, 'guest-token');

    carts.assertCartOwner.mockRejectedValueOnce(new Error('Cart access denied'));
    await expect(service.getGuest(guestOrder.id, 'wrong-token')).rejects.toThrow(
      'Cart access denied',
    );
  });

  it('scopes customer order detail to the authenticated owner', async () => {
    await service.getMine(order.userId, order.id);

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: order.id, userId: order.userId },
      }),
    );
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(service.getMine('different-customer', order.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('records an audit event for a valid administrative transition', async () => {
    await service.transition('admin-id', order.id, OrderStatus.PROCESSING, {
      ipAddress: '127.0.0.1',
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-id',
        action: 'order.status_changed',
        entityId: order.id,
        metadata: { from: OrderStatus.CONFIRMED, to: OrderStatus.PROCESSING },
      }),
    );
  });

  it('rejects an invalid transition and does not write a misleading audit event', async () => {
    prisma.$executeRaw.mockRejectedValue(
      new Error('invalid order transition from confirmed to delivered'),
    );

    await expect(
      service.transition('admin-id', order.id, OrderStatus.DELIVERED, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('returns the full admin detail after a transition', async () => {
    await service.transition('admin-id', order.id, OrderStatus.PROCESSING, {});

    expect(prisma.order.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: order.id },
        include: expect.objectContaining({
          payments: expect.anything(),
          shipments: expect.anything(),
        }),
      }),
    );
  });

  it('generates a missing invoice on demand for a paid order only', async () => {
    prisma.order.findUnique.mockResolvedValueOnce({ ...order, confirmedAt: new Date() });
    await expect(service.adminInvoiceUrl(order.id)).resolves.toEqual({
      url: 'https://signed.example/invoice',
      expiresIn: 300,
    });
    expect(invoices.ensure).toHaveBeenCalledWith(expect.objectContaining({ id: order.id }));
    expect(invoices.signedUrl).toHaveBeenCalledWith('invoices/generated.pdf');

    invoices.ensure.mockClear();
    prisma.order.findUnique.mockResolvedValueOnce({ ...order, confirmedAt: null });
    await expect(service.adminInvoiceUrl(order.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(invoices.ensure).not.toHaveBeenCalled();
  });

  it('lists slim admin rows with a database item count', async () => {
    const rows = await service.listAdmin({ limit: 25, offset: 0 });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.not.objectContaining({ itemsSnapshot: true }) }),
    );
    expect(rows[0]).toEqual(expect.objectContaining({ id: order.id, itemCount: 2 }));
  });

  it('builds daily IST revenue as captured minus processed refunds', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        day: '2026-10-10',
        captured_paise: BigInt(50_000),
        captured_payments: BigInt(2),
        refunded_paise: BigInt(10_000),
        processed_refunds: BigInt(1),
      },
      {
        day: '2026-10-11',
        captured_paise: BigInt(0),
        captured_payments: BigInt(0),
        refunded_paise: BigInt(2_000),
        processed_refunds: BigInt(1),
      },
    ]);

    const report = await service.revenue(2);

    expect(report.timezone).toBe('Asia/Kolkata');
    expect(report.days[0]).toEqual({
      date: '2026-10-10',
      capturedPaise: 50_000,
      refundedPaise: 10_000,
      netPaise: 40_000,
      capturedPayments: 2,
      processedRefunds: 1,
    });
    expect(report.totals).toEqual({
      capturedPaise: 50_000,
      refundedPaise: 12_000,
      netPaise: 38_000,
      capturedPayments: 2,
      processedRefunds: 2,
    });
  });

  it('applies admin status, customer, date, and search filters', async () => {
    await service.listAdmin({
      status: OrderStatus.CONFIRMED,
      userId: order.userId,
      search: '  GHC ',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.000Z',
      limit: 20,
      offset: 40,
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: OrderStatus.CONFIRMED,
          userId: order.userId,
          createdAt: {
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lte: new Date('2026-07-31T23:59:59.000Z'),
          },
          OR: expect.arrayContaining([
            { orderNumber: { contains: 'GHC', mode: 'insensitive' } },
            {
              addressSnapshot: {
                path: ['recipientName'],
                string_contains: 'GHC',
                mode: 'insensitive',
              },
            },
          ]),
        }),
        skip: 40,
        take: 20,
      }),
    );
  });

  describe('admin cancellation', () => {
    const cartId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    let tx: {
      $queryRaw: jest.Mock;
      $executeRaw: jest.Mock;
      shipment: { findFirst: jest.Mock };
      auditLog: { create: jest.Mock };
    };
    let redis: { increment: jest.Mock };

    beforeEach(() => {
      tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ status: 'confirmed', cart_id: cartId }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        shipment: { findFirst: jest.fn().mockResolvedValue(null) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      redis = { increment: jest.fn().mockResolvedValue(2) };
      Object.assign(prisma, {
        $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
      });
      prisma.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.CANCELLED });
      service = new OrdersService(
        prisma as unknown as PrismaService,
        audit as unknown as AuditService,
        invoices as unknown as InvoiceService,
        carts as unknown as CartService,
        redis as never,
      );
    });

    const sql = (mock: jest.Mock, call: number): string =>
      (mock.mock.calls[call][0] as TemplateStringsArray).join('?');

    it('cancels a confirmed order through cancel_order and audits the reason', async () => {
      const result = await service.cancelAdmin('admin-id', order.id, '  Customer asked  ', {
        ipAddress: '127.0.0.1',
      });

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(sql(tx.$executeRaw, 0)).toContain('public.cancel_order(');
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'admin-id',
          action: 'order.admin_cancelled',
          entityId: order.id,
          metadata: { from: 'CONFIRMED', reason: 'Customer asked' },
          ipAddress: '127.0.0.1',
        }),
      });
      expect(redis.increment).toHaveBeenCalled();
      // The full admin detail, so the dialog can refresh in place.
      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ payments: expect.anything() }),
        }),
      );
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('releases consumed stock itself for a processing order with no shipment', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ status: 'processing', cart_id: cartId }])
        .mockResolvedValueOnce([
          { id: 'r1', warehouse_id: 'w1', variant_id: 'v1', quantity: 2 },
          { id: 'r2', warehouse_id: 'w1', variant_id: 'v2', quantity: 1 },
        ]);

      await service.cancelAdmin('admin-id', order.id, 'Out of stock', {});

      const statements = tx.$executeRaw.mock.calls.map((_, index) => sql(tx.$executeRaw, index));
      expect(
        statements.filter((text) => text.includes('update public.inventory_levels')),
      ).toHaveLength(2);
      expect(statements.filter((text) => text.includes("set status = 'released'"))).toHaveLength(2);
      expect(
        statements.filter((text) => text.includes('insert into public.stock_movements')),
      ).toHaveLength(2);
      expect(statements.at(-1)).toContain("set status = 'cancelled'");
      expect(statements.some((text) => text.includes('cancel_order'))).toBe(false);
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ metadata: { from: 'PROCESSING', reason: 'Out of stock' } }),
      });
    });

    it('refuses a processing order that already has a live shipment', async () => {
      tx.$queryRaw.mockResolvedValueOnce([{ status: 'processing', cart_id: cartId }]);
      tx.shipment.findFirst.mockResolvedValue({ id: 'shipment-1' });

      await expect(service.cancelAdmin('admin-id', order.id, 'Late', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects a second cancellation and orders that already shipped', async () => {
      tx.$queryRaw.mockResolvedValueOnce([{ status: 'cancelled', cart_id: cartId }]);
      await expect(service.cancelAdmin('admin-id', order.id, 'Again', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      tx.$queryRaw.mockResolvedValueOnce([{ status: 'shipped', cart_id: cartId }]);
      await expect(service.cancelAdmin('admin-id', order.id, 'Late', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      tx.$queryRaw.mockResolvedValueOnce([]);
      await expect(service.cancelAdmin('admin-id', order.id, 'Gone', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('requires a reason and maps database failures to a bad request', async () => {
      await expect(service.cancelAdmin('admin-id', order.id, '   ', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      tx.$executeRaw.mockRejectedValue(new Error('order cannot be cancelled from status shipped'));
      await expect(service.cancelAdmin('admin-id', order.id, 'Reason', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(redis.increment).not.toHaveBeenCalled();
    });
  });

  it('keeps fulfilment moves to admins and warehouse managers, cancellation to admins', () => {
    const roles = (target: object): AppRole[] =>
      Reflect.getMetadata(ROLES_KEY, target) as AppRole[];
    const orders = AdminOrdersController.prototype;
    const fulfilment = FulfilmentController.prototype;

    expect(roles(orders.transition)).toEqual([AppRole.ADMIN, AppRole.WAREHOUSE_MANAGER]);
    expect(roles(orders.cancel)).toEqual([AppRole.ADMIN]);
    expect(roles(fulfilment.markShipped)).toEqual([AppRole.ADMIN, AppRole.WAREHOUSE_MANAGER]);
    expect(roles(fulfilment.createShipment)).toEqual([AppRole.ADMIN, AppRole.WAREHOUSE_MANAGER]);
    // Support still views orders and handles returns.
    expect(roles(AdminOrdersController)).toContain(AppRole.SUPPORT_AGENT);
    expect(roles(fulfilment.reviewReturn)).toContain(AppRole.SUPPORT_AGENT);
  });
});
