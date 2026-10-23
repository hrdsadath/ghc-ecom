import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryLevel, Prisma, StockMovementType, Warehouse } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { auditChangeMetadata } from '../audit/audit-change';
import { PUBLIC_CATALOGUE_CACHE_VERSION_KEY } from '../catalogue/catalogue.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BulkInventoryRowDto, BulkSetInventoryDto } from './dto/bulk-set-inventory.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { SetInventoryDto } from './dto/set-inventory.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

/** An inventory level plus the display fields the admin needs without catalogue access. */
export interface InventoryLevelView {
  id: string;
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
  updatedAt: Date;
  sku: string;
  alias: string | null;
  productId: string;
  productName: string;
  color: string | null;
  colorHex: string | null;
  thumbnailUrl: string | null;
  variantIsActive: boolean;
  warehouseCode: string;
  warehouseName: string;
  warehouseIsActive: boolean;
}

export interface BulkInventoryRowError {
  /** Zero-based position of the row in the request. */
  index: number;
  message: string;
}

export interface BulkInventoryResult {
  updated: number;
  unchanged: number;
  movements: number;
}

interface LockedLevelRow {
  id: string;
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
}

const HEX_COLOUR = /^#[0-9A-F]{6}$/i;

const stockChangedMessage = (current: number): string =>
  `Stock changed to ${current} since you loaded it — reload and retry`;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis?: RedisService,
  ) {}

  async createWarehouse(actorId: string, input: CreateWarehouseDto): Promise<Warehouse> {
    const code = input.code.toUpperCase();
    let warehouse: Warehouse;
    try {
      warehouse = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.warehouse.create({
          data: { ...input, code },
        });
        const variants = await transaction.productVariant.findMany({ select: { id: true } });
        if (variants.length > 0) {
          await transaction.inventoryLevel.createMany({
            data: variants.map((variant) => ({
              warehouseId: created.id,
              variantId: variant.id,
            })),
          });
        }
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Warehouse code ${code} already exists`);
      }
      throw error;
    }
    await this.audit.record({
      actorId,
      action: 'inventory.warehouse.created',
      entityType: 'warehouse',
      entityId: warehouse.id,
      metadata: auditChangeMetadata(warehouse.name, {}, warehouse, ['code', 'name', 'isActive']),
    });
    await this.invalidateCatalogue();
    return warehouse;
  }

  async updateWarehouse(
    actorId: string,
    warehouseId: string,
    input: UpdateWarehouseDto,
  ): Promise<Warehouse> {
    const { warehouse, previous } = await this.prisma.$transaction(async (transaction) => {
      // Lock the warehouse so a deactivation and the reserved-stock check see the same state.
      const [existing] = await transaction.$queryRaw<{ id: string }[]>`
        select id from public.warehouses where id = ${warehouseId}::uuid for update`;
      if (!existing) throw new NotFoundException('Warehouse not found');
      const before = await transaction.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
      if (input.isActive === false && before.isActive) {
        const {
          _sum: { reserved },
        } = await transaction.inventoryLevel.aggregate({
          where: { warehouseId },
          _sum: { reserved: true },
        });
        if ((reserved ?? 0) > 0) {
          throw new ConflictException(
            `${before.name} still holds ${reserved} reserved unit(s) for open orders. ` +
              'Ship or release them before deactivating the warehouse.',
          );
        }
      }
      const updated = await transaction.warehouse.update({
        where: { id: warehouseId },
        data: {
          name: input.name?.trim(),
          isActive: input.isActive,
        },
      });
      return { warehouse: updated, previous: before };
    });
    await this.audit.record({
      actorId,
      action: 'inventory.warehouse.updated',
      entityType: 'warehouse',
      entityId: warehouse.id,
      metadata: auditChangeMetadata(warehouse.name, previous, warehouse, ['name', 'isActive']),
    });
    await this.invalidateCatalogue();
    return warehouse;
  }

  async setInventory(
    actorId: string,
    warehouseId: string,
    input: SetInventoryDto,
  ): Promise<InventoryLevel> {
    const { level, previous } = await this.prisma.$transaction(async (transaction) => {
      // Lock the row: checkout and payment capture change on_hand/reserved concurrently.
      const [existing] = await transaction.$queryRaw<LockedLevelRow[]>`
        select
          id,
          warehouse_id as "warehouseId",
          variant_id as "variantId",
          on_hand as "onHand",
          reserved,
          low_stock_threshold as "lowStockThreshold"
        from public.inventory_levels
        where warehouse_id = ${warehouseId}::uuid
          and variant_id = ${input.variantId}::uuid
        for update`;
      const currentOnHand = existing?.onHand ?? 0;
      if (input.expectedOnHand !== undefined && input.expectedOnHand !== currentOnHand) {
        throw new ConflictException(stockChangedMessage(currentOnHand));
      }
      const onHand = input.onHand ?? currentOnHand;
      if (existing && onHand < existing.reserved) {
        throw new ConflictException(
          `On-hand stock cannot be lower than the ${existing.reserved} unit(s) currently reserved`,
        );
      }
      const saved = await transaction.inventoryLevel.upsert({
        where: {
          warehouseId_variantId: {
            warehouseId,
            variantId: input.variantId,
          },
        },
        create: {
          warehouseId,
          variantId: input.variantId,
          onHand,
          lowStockThreshold: input.lowStockThreshold,
        },
        update: {
          onHand,
          lowStockThreshold: input.lowStockThreshold,
        },
      });
      const difference = onHand - currentOnHand;
      if (difference !== 0) {
        await transaction.stockMovement.create({
          data: {
            warehouseId,
            variantId: input.variantId,
            type: StockMovementType.ADJUSTMENT,
            quantity: difference,
            actorId,
            referenceType: 'inventory_level',
            referenceId: saved.id,
          },
        });
      }
      return { level: saved, previous: existing };
    });
    await this.audit.record({
      actorId,
      action: 'inventory.level.set',
      entityType: 'inventory_level',
      entityId: level.id,
      metadata: {
        ...auditChangeMetadata(
          `Variant ${input.variantId} · Warehouse ${warehouseId}`,
          previous ?? {},
          level,
          ['onHand', 'reserved', 'lowStockThreshold'],
        ),
        warehouseId,
        variantId: input.variantId,
      },
    });
    await this.invalidateCatalogue();
    return level;
  }

  /**
   * Applies a whole stock import in one transaction: every row is validated against the
   * locked current levels first, and nothing is written unless every row is valid.
   */
  async bulkSetInventory(
    actorId: string,
    input: BulkSetInventoryDto,
  ): Promise<BulkInventoryResult> {
    const rows = input.rows;
    const result = await this.prisma.$transaction(
      async (transaction) => {
        const errors: BulkInventoryRowError[] = [];
        const seen = new Map<string, number>();
        rows.forEach((row, index) => {
          const key = `${row.warehouseId}::${row.variantId}`;
          const first = seen.get(key);
          if (first !== undefined) {
            errors.push({ index, message: `Duplicates the warehouse/SKU in row index ${first}` });
          } else seen.set(key, index);
        });
        if (errors.length) throw this.bulkConflict(errors);

        const warehouseIds = [...new Set(rows.map((row) => row.warehouseId))];
        const variantIds = [...new Set(rows.map((row) => row.variantId))];
        const [knownWarehouses, knownVariants] = await Promise.all([
          transaction.$queryRaw<{ id: string }[]>`
            select id from public.warehouses where id = any(${warehouseIds}::uuid[])`,
          transaction.$queryRaw<{ id: string }[]>`
            select id from public.product_variants where id = any(${variantIds}::uuid[])`,
        ]);
        const warehouseSet = new Set(knownWarehouses.map((row) => row.id));
        const variantSet = new Set(knownVariants.map((row) => row.id));

        // Lock every targeted level in a stable order so concurrent imports cannot deadlock.
        const locked = await transaction.$queryRaw<LockedLevelRow[]>`
          select
            level.id,
            level.warehouse_id as "warehouseId",
            level.variant_id as "variantId",
            level.on_hand as "onHand",
            level.reserved,
            level.low_stock_threshold as "lowStockThreshold"
          from public.inventory_levels as level
          join unnest(
            ${rows.map((row) => row.warehouseId)}::uuid[],
            ${rows.map((row) => row.variantId)}::uuid[]
          ) as input(warehouse_id, variant_id)
            on level.warehouse_id = input.warehouse_id
           and level.variant_id = input.variant_id
          order by level.id
          for update of level`;
        const current = new Map(
          locked.map((level) => [`${level.warehouseId}::${level.variantId}`, level]),
        );

        const changed: { row: BulkInventoryRowDto; previousOnHand: number }[] = [];
        rows.forEach((row, index) => {
          if (!warehouseSet.has(row.warehouseId)) {
            errors.push({ index, message: 'Warehouse does not exist' });
            return;
          }
          if (!variantSet.has(row.variantId)) {
            errors.push({ index, message: 'Variant does not exist' });
            return;
          }
          const level = current.get(`${row.warehouseId}::${row.variantId}`);
          const previousOnHand = level?.onHand ?? 0;
          if (row.expectedOnHand !== undefined && row.expectedOnHand !== previousOnHand) {
            errors.push({ index, message: stockChangedMessage(previousOnHand) });
            return;
          }
          if (level && row.onHand < level.reserved) {
            errors.push({
              index,
              message: `on_hand ${row.onHand} is lower than the ${level.reserved} unit(s) currently reserved`,
            });
            return;
          }
          if (
            level &&
            level.onHand === row.onHand &&
            level.lowStockThreshold === row.lowStockThreshold
          ) {
            return;
          }
          changed.push({ row, previousOnHand });
        });
        if (errors.length) throw this.bulkConflict(errors);
        if (!changed.length) return { updated: 0, unchanged: rows.length, movements: 0 };

        const [written] = await transaction.$queryRaw<{ updated: number; movements: number }[]>`
          with input as (
            select *
            from unnest(
              ${changed.map(({ row }) => row.warehouseId)}::uuid[],
              ${changed.map(({ row }) => row.variantId)}::uuid[],
              ${changed.map(({ row }) => row.onHand)}::integer[],
              ${changed.map(({ row }) => row.lowStockThreshold)}::integer[],
              ${changed.map(({ previousOnHand }) => previousOnHand)}::integer[]
            ) as input(warehouse_id, variant_id, on_hand, low_stock_threshold, previous_on_hand)
          ),
          upserted as (
            insert into public.inventory_levels (warehouse_id, variant_id, on_hand, low_stock_threshold)
            select warehouse_id, variant_id, on_hand, low_stock_threshold from input
            on conflict (warehouse_id, variant_id) do update
              set on_hand = excluded.on_hand,
                  low_stock_threshold = excluded.low_stock_threshold,
                  updated_at = now()
            returning id, warehouse_id, variant_id
          ),
          movements as (
            insert into public.stock_movements (
              warehouse_id, variant_id, type, quantity, actor_id, reference_type, reference_id, metadata
            )
            select
              upserted.warehouse_id,
              upserted.variant_id,
              'adjustment'::public.stock_movement_type,
              input.on_hand - input.previous_on_hand,
              ${actorId}::uuid,
              'inventory_level',
              upserted.id::text,
              '{"source":"bulk_import"}'::jsonb
            from upserted
            join input
              on input.warehouse_id = upserted.warehouse_id
             and input.variant_id = upserted.variant_id
            where input.on_hand <> input.previous_on_hand
            returning 1
          )
          select
            (select count(*) from upserted)::integer as updated,
            (select count(*) from movements)::integer as movements`;
        return {
          updated: written.updated,
          unchanged: rows.length - changed.length,
          movements: written.movements,
        };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
    if (result.updated > 0) {
      await this.audit.record({
        actorId,
        action: 'inventory.levels.bulk_set',
        entityType: 'inventory_level',
        metadata: {
          entityLabel: `Inventory import · ${result.updated} level(s) updated`,
          rows: rows.length,
          updated: result.updated,
          unchanged: result.unchanged,
          stockMovements: result.movements,
        },
      });
      await this.invalidateCatalogue();
    }
    return result;
  }

  async listLevels(): Promise<InventoryLevelView[]> {
    const rows = await this.prisma.$queryRaw<InventoryLevelView[]>`
      select
        level.id,
        level.warehouse_id as "warehouseId",
        level.variant_id as "variantId",
        level.on_hand as "onHand",
        level.reserved,
        level.low_stock_threshold as "lowStockThreshold",
        level.updated_at as "updatedAt",
        variant.sku,
        nullif(btrim(variant.alias), '') as alias,
        product.id as "productId",
        product.name as "productName",
        nullif(btrim(variant.attributes ->> 'color'), '') as color,
        variant.attributes ->> 'colorHex' as "colorHex",
        coalesce(variant_image.thumbnail_url, product_image.thumbnail_url) as "thumbnailUrl",
        variant.is_active as "variantIsActive",
        warehouse.code as "warehouseCode",
        warehouse.name as "warehouseName",
        warehouse.is_active as "warehouseIsActive"
      from public.inventory_levels as level
      join public.product_variants as variant on variant.id = level.variant_id
      join public.products as product on product.id = variant.product_id
      join public.warehouses as warehouse on warehouse.id = level.warehouse_id
      left join lateral (
        select image.thumbnail_url
        from public.product_image_variants as association
        join public.product_images as image on image.id = association.image_id
        where association.variant_id = variant.id
        order by image.sort_order, image.created_at
        limit 1
      ) as variant_image on true
      left join lateral (
        select image.thumbnail_url
        from public.product_images as image
        where image.product_id = product.id
          and not exists (
            select 1 from public.product_image_variants as association
            where association.image_id = image.id
          )
        order by image.sort_order, image.created_at
        limit 1
      ) as product_image on true
      order by lower(product.name), product.name, variant.sku, warehouse.code`;
    return rows.map((row) => ({
      ...row,
      colorHex: row.colorHex && HEX_COLOUR.test(row.colorHex) ? row.colorHex.toUpperCase() : null,
    }));
  }

  listWarehouses(): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({ orderBy: { code: 'asc' } });
  }

  private bulkConflict(errors: BulkInventoryRowError[]): ConflictException {
    return new ConflictException({
      error: 'Conflict',
      message: `Import rejected: ${errors.length} row(s) need attention. No stock was changed.`,
      errors: errors.slice(0, 500),
    });
  }

  private async invalidateCatalogue(): Promise<void> {
    try {
      await this.redis?.increment(PUBLIC_CATALOGUE_CACHE_VERSION_KEY);
    } catch {
      // Inventory writes remain authoritative when the cache is unavailable.
    }
  }
}
