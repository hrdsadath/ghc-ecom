import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  Prisma,
  ReturnRequest,
  ReturnStatus,
  Shipment,
  ShipmentStatus,
  StockMovementType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PUBLIC_CATALOGUE_CACHE_VERSION_KEY } from '../catalogue/catalogue.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ReviewReturnDto } from './dto/review-return.dto';
import { ShippingProviderService } from './shipping-provider.service';

const shipmentInclude = {
  items: true,
  events: { orderBy: { occurredAt: 'asc' as const } },
} satisfies Prisma.ShipmentInclude;

export type ShipmentDetail = Prisma.ShipmentGetPayload<{
  include: typeof shipmentInclude;
}>;

export type RestockedLine = {
  warehouseId: string;
  variantId: string;
  quantity: number;
};

export type ReviewedReturn = ReturnRequest & { restockedUnits: number };

@Injectable()
export class FulfilmentService {
  private readonly logger = new Logger(FulfilmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ShippingProviderService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly redis?: RedisService,
  ) {}

  async createShipment(
    actorId: string,
    orderId: string,
    input: CreateShipmentDto,
  ): Promise<Shipment> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PROCESSING) {
      throw new BadRequestException('Order must be processing before shipment creation');
    }
    await this.requireNoActiveShipment(this.prisma, orderId);
    const provider = await this.provider.create(order, input.carrier);
    const shipment = await this.prisma.$transaction(async (transaction) => {
      // Serialises concurrent requests for the same order before re-checking.
      await transaction.$queryRaw`select id from public.orders where id = ${orderId}::uuid for update`;
      await this.requireNoActiveShipment(transaction, orderId);
      return transaction.shipment.create({
        data: {
          orderId,
          ...provider,
          addressSnapshot: this.json(order.addressSnapshot),
          items: { create: this.provider.items(order.itemsSnapshot) },
        },
      });
    });
    await this.audit.record({
      actorId,
      action: 'shipment.created',
      entityType: 'shipment',
      entityId: shipment.id,
      metadata: { orderId, provider: provider.provider },
    });
    return shipment;
  }

  listMine(userId: string, orderId: string): Promise<ShipmentDetail[]> {
    return this.prisma.shipment.findMany({
      relationLoadStrategy: 'join',
      where: { orderId, order: { userId } },
      include: shipmentInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Marks a processing order shipped. The shipment is created (or the unshipped one reused),
   * then `advance_shipment_status` moves it in transit and the order to shipped in the same
   * transaction, which queues the `order.shipped` thank-you email.
   */
  async markShipped(actorId: string, orderId: string): Promise<Shipment> {
    const shipmentId = await this.prisma.$transaction(async (transaction) => {
      // The row lock serialises a mark-shipped with a concurrent cancellation of the same order.
      const [row] = await transaction.$queryRaw<Array<{ status: string }>>`
        select status::text as status from public.orders where id = ${orderId}::uuid for update`;
      if (!row) throw new NotFoundException('Order not found');
      if (row.status !== 'processing') {
        throw new BadRequestException('Only processing orders can be marked shipped');
      }
      const order = await transaction.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order not found');
      const live = await transaction.shipment.findFirst({
        where: { orderId, status: { in: [ShipmentStatus.CREATED, ShipmentStatus.LABEL_CREATED] } },
        orderBy: { createdAt: 'desc' },
      });
      // No courier or tracking number is recorded for a staff-shipped order.
      const id =
        live?.id ??
        (
          await transaction.shipment.create({
            data: {
              orderId,
              provider: 'manual',
              addressSnapshot: this.json(order.addressSnapshot),
              items: { create: this.provider.items(order.itemsSnapshot) },
            },
          })
        ).id;
      const target = ShipmentStatus.IN_TRANSIT.toLowerCase();
      try {
        await transaction.$executeRaw`select public.advance_shipment_status(
          ${id}::uuid,
          ${`mark-shipped:${id}`},
          ${target}::public.shipment_status,
          ${'Marked shipped by staff'},
          ${null},
          ${new Date()}::timestamptz
        )`;
      } catch {
        throw new BadRequestException('Order could not be marked shipped');
      }
      return id;
    });
    await this.audit.record({
      actorId,
      action: 'order.marked_shipped',
      entityType: 'shipment',
      entityId: shipmentId,
      metadata: { orderId },
    });
    return this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  }

  async requestReturn(
    userId: string,
    orderId: string,
    input: CreateReturnDto,
  ): Promise<ReturnRequest> {
    // Staff no longer record delivery, so the window runs from delivery when known, else dispatch.
    const shipment = await this.prisma.shipment.findFirst({
      where: {
        orderId,
        order: { userId },
        status: {
          in: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const windowStart = shipment?.deliveredAt ?? shipment?.shippedAt;
    if (!windowStart) throw new BadRequestException('Order has not been shipped');
    const returnWindowDays = this.config.getOrThrow<number>('RETURN_WINDOW_DAYS');
    const eligibleUntil = new Date(windowStart.getTime() + returnWindowDays * 24 * 60 * 60 * 1000);
    if (eligibleUntil <= new Date()) {
      throw new BadRequestException('Return eligibility window has expired');
    }
    const active = await this.prisma.returnRequest.findFirst({
      where: {
        orderId,
        status: {
          in: [
            ReturnStatus.REQUESTED,
            ReturnStatus.APPROVED,
            ReturnStatus.RECEIVED,
            ReturnStatus.REFUND_PENDING,
          ],
        },
      },
    });
    if (active) throw new BadRequestException('An active return already exists');
    return this.prisma.returnRequest.create({
      data: { orderId, userId, reason: input.reason, eligibleUntil },
    });
  }

  async reviewReturn(
    actorId: string,
    returnId: string,
    input: ReviewReturnDto,
  ): Promise<ReviewedReturn> {
    const request = await this.prisma.returnRequest.findUnique({ where: { id: returnId } });
    if (!request) throw new NotFoundException('Return request not found');
    const allowed =
      (request.status === ReturnStatus.REQUESTED &&
        (input.status === ReturnStatus.APPROVED || input.status === ReturnStatus.REJECTED)) ||
      (request.status === ReturnStatus.APPROVED && input.status === ReturnStatus.RECEIVED);
    if (!allowed) throw new BadRequestException('Return state transition is not allowed');
    if (input.restock && input.status !== ReturnStatus.RECEIVED) {
      throw new BadRequestException('Stock can only be restored when a return is received');
    }
    const { updated, restocked } = await this.prisma.$transaction(async (transaction) => {
      // Guarded on the status that was validated, so two reviewers cannot both apply.
      const { count } = await transaction.returnRequest.updateMany({
        where: { id: returnId, status: request.status },
        data: {
          status: input.status,
          reviewNote: input.note,
          reviewedBy: actorId,
          reviewedAt: new Date(),
          receivedAt: input.status === ReturnStatus.RECEIVED ? new Date() : undefined,
        },
      });
      if (!count) {
        throw new ConflictException('Return was already updated; reload the order and try again');
      }
      const lines = input.restock ? await this.restock(transaction, actorId, request) : [];
      return {
        updated: await transaction.returnRequest.findUniqueOrThrow({ where: { id: returnId } }),
        restocked: lines,
      };
    });
    const restockedUnits = restocked.reduce((sum, line) => sum + line.quantity, 0);
    await this.audit.record({
      actorId,
      action: 'return.status_changed',
      entityType: 'return_request',
      entityId: returnId,
      metadata: {
        from: request.status,
        to: input.status,
        ...(input.restock ? { restocked } : {}),
      },
    });
    if (restockedUnits > 0) await this.invalidateCatalogue();
    return { ...updated, restockedUnits };
  }

  /**
   * Puts the units sold for the order back on hand in the warehouses they were
   * sold from, less anything an earlier return of the same order restored.
   */
  private async restock(
    transaction: Prisma.TransactionClient,
    actorId: string,
    request: ReturnRequest,
  ): Promise<RestockedLine[]> {
    const sold = await transaction.stockMovement.groupBy({
      by: ['warehouseId', 'variantId'],
      where: {
        type: StockMovementType.SALE,
        referenceType: 'order',
        referenceId: request.orderId,
      },
      _sum: { quantity: true },
      orderBy: [{ variantId: 'asc' }, { warehouseId: 'asc' }],
    });
    if (!sold.length) {
      throw new BadRequestException(
        'No stock sale is recorded for this order; adjust inventory manually instead',
      );
    }
    const siblings = await transaction.returnRequest.findMany({
      where: { orderId: request.orderId },
      select: { id: true },
    });
    const returned = await transaction.stockMovement.groupBy({
      by: ['warehouseId', 'variantId'],
      where: {
        type: StockMovementType.RETURN,
        referenceType: 'return_request',
        referenceId: { in: siblings.map((sibling) => sibling.id) },
      },
      _sum: { quantity: true },
    });
    const alreadyReturned = new Map(
      returned.map((row) => [`${row.warehouseId}:${row.variantId}`, row._sum.quantity ?? 0]),
    );
    const lines: RestockedLine[] = [];
    for (const row of sold) {
      const key = `${row.warehouseId}:${row.variantId}`;
      const quantity = -(row._sum.quantity ?? 0) - (alreadyReturned.get(key) ?? 0);
      if (quantity <= 0) continue;
      const { count } = await transaction.inventoryLevel.updateMany({
        where: { warehouseId: row.warehouseId, variantId: row.variantId },
        data: { onHand: { increment: quantity } },
      });
      if (!count) throw new ConflictException('Inventory level is missing for a returned item');
      await transaction.stockMovement.create({
        data: {
          warehouseId: row.warehouseId,
          variantId: row.variantId,
          type: StockMovementType.RETURN,
          quantity,
          referenceType: 'return_request',
          referenceId: request.id,
          actorId,
          metadata: { orderId: request.orderId },
        },
      });
      lines.push({ warehouseId: row.warehouseId, variantId: row.variantId, quantity });
    }
    return lines;
  }

  private async requireNoActiveShipment(
    client: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const active = await client.shipment.findFirst({
      where: { orderId, status: { not: ShipmentStatus.CANCELLED } },
      select: { id: true },
    });
    if (active) throw new ConflictException('This order already has a shipment');
  }

  private async invalidateCatalogue(): Promise<void> {
    try {
      await this.redis?.increment(PUBLIC_CATALOGUE_CACHE_VERSION_KEY);
    } catch (error) {
      // Stock writes remain authoritative when the cache is unavailable.
      this.logger.warn(
        `Catalogue cache version bump failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private json(value: Prisma.JsonValue): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
