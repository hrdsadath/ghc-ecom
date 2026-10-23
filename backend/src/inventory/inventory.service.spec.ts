import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';

const WAREHOUSE = '11111111-1111-4111-8111-111111111111';
const VARIANT = '22222222-2222-4222-8222-222222222222';

interface Harness {
  service: InventoryService;
  audit: { record: jest.Mock };
  redis: { increment: jest.Mock };
}

const setup = (transaction: Record<string, unknown>): Harness => {
  const prisma = {
    $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(transaction)),
  };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-id' }) };
  const redis = { increment: jest.fn().mockResolvedValue(1) };
  const service = new InventoryService(prisma as never, audit as never, redis as never);
  return { service, audit, redis };
};

const rowErrors = async (promise: Promise<unknown>): Promise<unknown[]> => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ConflictException);
  return ((error as ConflictException).getResponse() as { errors: unknown[] }).errors;
};

describe('InventoryService', () => {
  it('creates zero-stock inventory levels for every existing variant when a warehouse is created', async () => {
    const warehouse = { id: 'warehouse-id', code: 'MAIN', name: 'Main Warehouse' };
    const transaction = {
      warehouse: { create: jest.fn().mockResolvedValue(warehouse) },
      productVariant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'variant-a' }, { id: 'variant-b' }]),
      },
      inventoryLevel: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const { service } = setup(transaction);

    await expect(
      service.createWarehouse('actor-id', { code: 'main', name: 'Main Warehouse' }),
    ).resolves.toEqual(warehouse);

    expect(transaction.warehouse.create).toHaveBeenCalledWith({
      data: { code: 'MAIN', name: 'Main Warehouse' },
    });
    expect(transaction.inventoryLevel.createMany).toHaveBeenCalledWith({
      data: [
        { warehouseId: 'warehouse-id', variantId: 'variant-a' },
        { warehouseId: 'warehouse-id', variantId: 'variant-b' },
      ],
    });
  });

  it('reports a duplicate warehouse code clearly', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['code'] },
    });
    const { service } = setup({ warehouse: { create: jest.fn().mockRejectedValue(duplicate) } });

    await expect(
      service.createWarehouse('actor-id', { code: 'MAIN', name: 'Main' }),
    ).rejects.toThrow(new ConflictException('Warehouse code MAIN already exists'));
  });

  describe('setInventory', () => {
    const level = { id: 'level-id', onHand: 7, reserved: 2, lowStockThreshold: 3 };
    const transactionFor = (
      locked: object[],
    ): {
      $queryRaw: jest.Mock;
      inventoryLevel: { upsert: jest.Mock };
      stockMovement: { create: jest.Mock };
    } => ({
      $queryRaw: jest.fn().mockResolvedValue(locked),
      inventoryLevel: {
        upsert: jest.fn(({ update }: { update: object }) =>
          Promise.resolve({ ...level, ...update }),
        ),
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
    });

    it('rejects a save when stock changed since the editor loaded it', async () => {
      const transaction = transactionFor([level]);
      const { service, redis } = setup(transaction);

      await expect(
        service.setInventory('actor-id', WAREHOUSE, {
          variantId: VARIANT,
          onHand: 10,
          expectedOnHand: 8,
          lowStockThreshold: 3,
        }),
      ).rejects.toThrow(
        new ConflictException('Stock changed to 7 since you loaded it — reload and retry'),
      );
      expect(transaction.inventoryLevel.upsert).not.toHaveBeenCalled();
      expect(redis.increment).not.toHaveBeenCalled();
      const [sql] = transaction.$queryRaw.mock.calls[0] as [TemplateStringsArray];
      expect(sql.join('?')).toContain('for update');
    });

    it('keeps the locked on-hand quantity when only the threshold changes', async () => {
      const transaction = transactionFor([level]);
      const { service, redis } = setup(transaction);

      await expect(
        service.setInventory('actor-id', WAREHOUSE, { variantId: VARIANT, lowStockThreshold: 5 }),
      ).resolves.toMatchObject({ onHand: 7, lowStockThreshold: 5 });
      expect(transaction.inventoryLevel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { onHand: 7, lowStockThreshold: 5 } }),
      );
      expect(transaction.stockMovement.create).not.toHaveBeenCalled();
      expect(redis.increment).toHaveBeenCalledWith('catalogue:version');
    });

    it('records an adjustment movement for a matching expected quantity', async () => {
      const transaction = transactionFor([level]);
      const { service } = setup(transaction);

      await service.setInventory('actor-id', WAREHOUSE, {
        variantId: VARIANT,
        onHand: 12,
        expectedOnHand: 7,
        lowStockThreshold: 3,
      });
      expect(transaction.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ quantity: 5, type: 'ADJUSTMENT' }),
      });
    });

    it('refuses on-hand stock below reserved units', async () => {
      const { service } = setup(transactionFor([level]));
      await expect(
        service.setInventory('actor-id', WAREHOUSE, {
          variantId: VARIANT,
          onHand: 1,
          lowStockThreshold: 3,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('bulkSetInventory', () => {
    const lockedLevel = (onHand: number, reserved = 0): Record<string, unknown> => ({
      id: 'level-id',
      warehouseId: WAREHOUSE,
      variantId: VARIANT,
      onHand,
      reserved,
      lowStockThreshold: 1,
    });
    const queries = (...results: unknown[]): jest.Mock => {
      const queryRaw = jest.fn();
      for (const result of results) queryRaw.mockResolvedValueOnce(result);
      return queryRaw;
    };

    it('rejects the whole import with row-level errors and writes nothing', async () => {
      const queryRaw = queries([{ id: WAREHOUSE }], [{ id: VARIANT }], [lockedLevel(9, 4)]);
      const { service, audit, redis } = setup({ $queryRaw: queryRaw });

      await expect(
        rowErrors(
          service.bulkSetInventory('actor-id', {
            rows: [
              { warehouseId: WAREHOUSE, variantId: VARIANT, onHand: 2, lowStockThreshold: 1 },
              {
                warehouseId: '33333333-3333-4333-8333-333333333333',
                variantId: VARIANT,
                onHand: 2,
                lowStockThreshold: 1,
              },
            ],
          }),
        ),
      ).resolves.toEqual([
        { index: 0, message: 'on_hand 2 is lower than the 4 unit(s) currently reserved' },
        { index: 1, message: 'Warehouse does not exist' },
      ]);
      expect(queryRaw).toHaveBeenCalledTimes(3);
      expect(audit.record).not.toHaveBeenCalled();
      expect(redis.increment).not.toHaveBeenCalled();
    });

    it('flags duplicate rows before touching the database', async () => {
      const queryRaw = jest.fn();
      const { service } = setup({ $queryRaw: queryRaw });
      await expect(
        rowErrors(
          service.bulkSetInventory('actor-id', {
            rows: [
              { warehouseId: WAREHOUSE, variantId: VARIANT, onHand: 2, lowStockThreshold: 1 },
              { warehouseId: WAREHOUSE, variantId: VARIANT, onHand: 3, lowStockThreshold: 1 },
            ],
          }),
        ),
      ).resolves.toEqual([{ index: 1, message: expect.stringContaining('Duplicates') }]);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('flags rows whose stock changed since export', async () => {
      const queryRaw = queries([{ id: WAREHOUSE }], [{ id: VARIANT }], [lockedLevel(6)]);
      const { service } = setup({ $queryRaw: queryRaw });
      await expect(
        rowErrors(
          service.bulkSetInventory('actor-id', {
            rows: [
              {
                warehouseId: WAREHOUSE,
                variantId: VARIANT,
                onHand: 9,
                expectedOnHand: 5,
                lowStockThreshold: 1,
              },
            ],
          }),
        ),
      ).resolves.toEqual([
        { index: 0, message: 'Stock changed to 6 since you loaded it — reload and retry' },
      ]);
    });

    it('writes changed rows in one statement, audits once and bumps the cache once', async () => {
      const queryRaw = queries(
        [{ id: WAREHOUSE }],
        [{ id: VARIANT }],
        [lockedLevel(6)],
        [{ updated: 1, movements: 1 }],
      );
      const { service, audit, redis } = setup({ $queryRaw: queryRaw });

      await expect(
        service.bulkSetInventory('actor-id', {
          rows: [
            {
              warehouseId: WAREHOUSE,
              variantId: VARIANT,
              onHand: 9,
              expectedOnHand: 6,
              lowStockThreshold: 1,
            },
          ],
        }),
      ).resolves.toEqual({ updated: 1, unchanged: 0, movements: 1 });
      expect(queryRaw).toHaveBeenCalledTimes(4);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inventory.levels.bulk_set' }),
      );
      expect(redis.increment).toHaveBeenCalledTimes(1);
    });

    it('skips rows that already match and does not audit a no-op import', async () => {
      const queryRaw = queries([{ id: WAREHOUSE }], [{ id: VARIANT }], [lockedLevel(6)]);
      const { service, audit, redis } = setup({ $queryRaw: queryRaw });
      await expect(
        service.bulkSetInventory('actor-id', {
          rows: [{ warehouseId: WAREHOUSE, variantId: VARIANT, onHand: 6, lowStockThreshold: 1 }],
        }),
      ).resolves.toEqual({ updated: 0, unchanged: 1, movements: 0 });
      expect(queryRaw).toHaveBeenCalledTimes(3);
      expect(audit.record).not.toHaveBeenCalled();
      expect(redis.increment).not.toHaveBeenCalled();
    });
  });

  describe('updateWarehouse', () => {
    const before = { id: WAREHOUSE, name: 'Main', code: 'MAIN', isActive: true };
    const transactionFor = (
      reserved: number,
    ): {
      $queryRaw: jest.Mock;
      warehouse: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
      inventoryLevel: { aggregate: jest.Mock };
    } => ({
      $queryRaw: jest.fn().mockResolvedValue([{ id: WAREHOUSE }]),
      warehouse: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(before),
        update: jest.fn().mockResolvedValue({ ...before, name: 'Kochi', isActive: false }),
      },
      inventoryLevel: { aggregate: jest.fn().mockResolvedValue({ _sum: { reserved } }) },
    });

    it('blocks deactivation while units are reserved in that warehouse', async () => {
      const transaction = transactionFor(3);
      const { service } = setup(transaction);

      await expect(
        service.updateWarehouse('actor-id', WAREHOUSE, { isActive: false }),
      ).rejects.toThrow(/3 reserved unit/);
      expect(transaction.warehouse.update).not.toHaveBeenCalled();
    });

    it('renames and deactivates an idle warehouse', async () => {
      const transaction = transactionFor(0);
      const { service, audit, redis } = setup(transaction);

      await expect(
        service.updateWarehouse('actor-id', WAREHOUSE, { name: ' Kochi ', isActive: false }),
      ).resolves.toMatchObject({ name: 'Kochi', isActive: false });
      expect(transaction.warehouse.update).toHaveBeenCalledWith({
        where: { id: WAREHOUSE },
        data: { name: 'Kochi', isActive: false },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inventory.warehouse.updated' }),
      );
      expect(redis.increment).toHaveBeenCalled();
    });
  });

  it('normalises display colours on enriched inventory rows', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'a', colorHex: '#c5a059' },
        { id: 'b', colorHex: 'gold' },
      ]),
    };
    const service = new InventoryService(prisma as never, {} as never);
    await expect(service.listLevels()).resolves.toEqual([
      { id: 'a', colorHex: '#C5A059' },
      { id: 'b', colorHex: null },
    ]);
  });
});
