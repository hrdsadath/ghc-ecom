import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, ReturnStatus, ShipmentStatus, StockMovementType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { FulfilmentService } from './fulfilment.service';
import { ShippingProviderService } from './shipping-provider.service';

describe('FulfilmentService', () => {
  const order = {
    id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    orderNumber: 'GHC-1',
    status: OrderStatus.PROCESSING,
    itemsSnapshot: [{ variantId: 'variant-1', sku: 'SKU-1', quantity: 1 }],
    addressSnapshot: { city: 'Pune' },
  };
  let prisma: {
    order: { findUnique: jest.Mock };
    shipment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    returnRequest: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    stockMovement: { groupBy: jest.Mock; create: jest.Mock };
    inventoryLevel: { updateMany: jest.Mock };
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let redis: { increment: jest.Mock };
  let provider: {
    create: jest.Mock;
    items: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let service: FulfilmentService;

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      shipment: {
        create: jest.fn().mockResolvedValue({ id: 'shipment-1' }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'shipment-1',
          status: ShipmentStatus.IN_TRANSIT,
        }),
      },
      returnRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'return-1' }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'return-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'return-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: {
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      inventoryLevel: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((callback: (client: unknown) => Promise<unknown>) => callback(prisma)),
    };
    redis = { increment: jest.fn().mockResolvedValue(2) };
    provider = {
      create: jest.fn().mockResolvedValue({
        provider: 'test-carrier',
        providerShipmentId: 'provider-1',
        trackingNumber: 'TRACK-1',
      }),
      items: jest.fn().mockReturnValue([{ variantId: 'variant-1', sku: 'SKU-1', quantity: 1 }]),
    };
    audit = { record: jest.fn().mockResolvedValue({}) };
    service = new FulfilmentService(
      prisma as unknown as PrismaService,
      provider as unknown as ShippingProviderService,
      audit as unknown as AuditService,
      {
        getOrThrow: jest.fn().mockReturnValue(30),
      } as unknown as ConfigService,
      redis as never,
    );
  });

  it('creates a provider-backed shipment only for a processing order', async () => {
    await service.createShipment('admin-1', order.id, { carrier: 'Carrier' });

    expect(provider.create).toHaveBeenCalledWith(order, 'Carrier');
    expect(prisma.shipment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: order.id,
        provider: 'test-carrier',
        items: { create: [{ variantId: 'variant-1', sku: 'SKU-1', quantity: 1 }] },
      }),
    });
  });

  it('refuses a second shipment while one is active and never calls the provider', async () => {
    prisma.shipment.findFirst.mockResolvedValue({ id: 'shipment-1' });

    await expect(service.createShipment('admin-1', order.id, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(provider.create).not.toHaveBeenCalled();
    expect(prisma.shipment.create).not.toHaveBeenCalled();
  });

  it('re-checks for a shipment under the order row lock before inserting', async () => {
    prisma.shipment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'raced' });

    await expect(service.createShipment('admin-1', order.id, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.shipment.create).not.toHaveBeenCalled();
  });

  it('applies a return review only if the status is unchanged', async () => {
    prisma.returnRequest.findUnique.mockResolvedValue({
      id: 'return-1',
      orderId: order.id,
      status: ReturnStatus.REQUESTED,
    });
    prisma.returnRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.reviewReturn('admin-1', 'return-1', { status: ReturnStatus.APPROVED }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.returnRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'return-1', status: ReturnStatus.REQUESTED } }),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('restocks sold units minus earlier returns when asked, in the same transaction', async () => {
    prisma.returnRequest.findUnique.mockResolvedValue({
      id: 'return-2',
      orderId: order.id,
      status: ReturnStatus.APPROVED,
    });
    prisma.stockMovement.groupBy
      .mockResolvedValueOnce([
        { warehouseId: 'wh-1', variantId: 'variant-1', _sum: { quantity: -3 } },
        { warehouseId: 'wh-1', variantId: 'variant-2', _sum: { quantity: -1 } },
      ])
      .mockResolvedValueOnce([
        { warehouseId: 'wh-1', variantId: 'variant-2', _sum: { quantity: 1 } },
      ]);

    const result = await service.reviewReturn('admin-1', 'return-2', {
      status: ReturnStatus.RECEIVED,
      restock: true,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryLevel.updateMany).toHaveBeenCalledWith({
      where: { warehouseId: 'wh-1', variantId: 'variant-1' },
      data: { onHand: { increment: 3 } },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: StockMovementType.RETURN,
        quantity: 3,
        referenceType: 'return_request',
        referenceId: 'return-2',
      }),
    });
    expect(result.restockedUnits).toBe(3);
    expect(redis.increment).toHaveBeenCalledWith('catalogue:version');
  });

  it('does not touch stock when a return is received without restocking', async () => {
    prisma.returnRequest.findUnique.mockResolvedValue({
      id: 'return-3',
      orderId: order.id,
      status: ReturnStatus.APPROVED,
    });

    await service.reviewReturn('admin-1', 'return-3', { status: ReturnStatus.RECEIVED });

    expect(prisma.stockMovement.groupBy).not.toHaveBeenCalled();
    expect(prisma.inventoryLevel.updateMany).not.toHaveBeenCalled();
    expect(redis.increment).not.toHaveBeenCalled();
  });

  it('rejects a return outside the thirty-day delivery window', async () => {
    prisma.shipment.findFirst.mockResolvedValue({
      deliveredAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });

    await expect(
      service.requestReturn('customer-1', order.id, {
        reason: 'The product was damaged during delivery',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.returnRequest.create).not.toHaveBeenCalled();
  });

  it('accepts an eligible return and records its fixed eligibility deadline', async () => {
    const deliveredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prisma.shipment.findFirst.mockResolvedValue({ deliveredAt });

    await service.requestReturn('customer-1', order.id, {
      reason: 'The product was damaged during delivery',
    });

    expect(prisma.returnRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: order.id,
        userId: 'customer-1',
        eligibleUntil: new Date(deliveredAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      }),
    });
  });

  it('rejects an invalid return review transition', async () => {
    prisma.returnRequest.findUnique.mockResolvedValue({
      id: 'return-1',
      status: ReturnStatus.REJECTED,
    });

    await expect(
      service.reviewReturn('admin-1', 'return-1', {
        status: ReturnStatus.RECEIVED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
