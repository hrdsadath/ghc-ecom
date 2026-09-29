import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import {
  CartStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
  ReturnStatus,
  ShipmentStatus,
} from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/database/prisma.service';
import { FulfilmentService } from '../src/fulfilment/fulfilment.service';
import { RefundsService } from '../src/fulfilment/refunds.service';
import { ShippingProviderService } from '../src/fulfilment/shipping-provider.service';
import { HdfcGatewayService, HdfcRefund } from '../src/payments/hdfc/hdfc-gateway.service';
import { normalizeSupabaseUrl } from '../src/config/env.validation';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const prisma = new PrismaClient();
const admin = createClient(
  normalizeSupabaseUrl(required('SUPABASE_URL')),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function run(): Promise<void> {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  let userId: string | undefined;
  let cartId: string | undefined;
  let quoteId: string | undefined;
  let orderId: string | undefined;
  let shipmentId: string | undefined;
  let paymentId: string | undefined;

  try {
    const { data: user, error } = await admin.auth.admin.createUser({
      email: `phase7.${suffix}@gmail.com`,
      password: `T3st!${randomBytes(18).toString('base64url')}`,
      email_confirm: true,
    });
    if (error) throw error;
    userId = user.user.id;
    const cart = await prisma.cart.create({
      data: {
        userId,
        status: CartStatus.CONVERTED,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    cartId = cart.id;
    const quote = await prisma.checkoutQuote.create({
      data: {
        cartId,
        userId,
        status: 'CONVERTED',
        itemsSnapshot: [{ sku: 'P7-SKU', quantity: 1 }],
        addressSnapshot: {
          recipientName: 'Phase Seven',
          phone: '9876543210',
          city: 'Pune',
          country: 'IN',
        },
        subtotalPaise: 10_000,
        discountPaise: 0,
        shippingPaise: 900,
        taxPaise: 1_800,
        totalPaise: 12_700,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    quoteId = quote.id;
    const order = await prisma.order.create({
      data: {
        orderNumber: `P7-${suffix}`,
        hdfcOrderId: `GHCP7${suffix.replace(/[^a-z0-9]/gi, '')}`.slice(0, 20),
        quoteId,
        cartId,
        userId,
        status: OrderStatus.PROCESSING,
        itemsSnapshot: quote.itemsSnapshot as Prisma.InputJsonValue,
        addressSnapshot: quote.addressSnapshot as Prisma.InputJsonValue,
        subtotalPaise: quote.subtotalPaise,
        discountPaise: quote.discountPaise,
        shippingPaise: quote.shippingPaise,
        taxPaise: quote.taxPaise,
        totalPaise: quote.totalPaise,
        paymentExpiresAt: quote.expiresAt,
      },
    });
    orderId = order.id;
    const shipment = await prisma.shipment.create({
      data: {
        orderId,
        provider: 'live-test',
        providerShipmentId: `provider-${suffix}`,
        trackingNumber: `TRACK-${suffix}`,
        addressSnapshot: quote.addressSnapshot as Prisma.InputJsonValue,
        items: { create: { sku: 'P7-SKU', quantity: 1 } },
      },
    });
    shipmentId = shipment.id;

    const event = async (
      providerEventId: string,
      status: string,
      occurredAt: Date,
    ): Promise<void> => {
      await prisma.$executeRaw`select public.advance_shipment_status(
        ${shipment.id}::uuid,
        ${providerEventId},
        ${status}::public.shipment_status,
        ${status},
        ${'Pune'},
        ${occurredAt}::timestamptz
      )`;
    };
    await event('p7-transit', 'in_transit', new Date());
    await event('p7-transit', 'in_transit', new Date());
    await event('p7-out', 'out_for_delivery', new Date());
    const deliveredAt = new Date();
    await event('p7-delivered', 'delivered', deliveredAt);
    const [deliveredOrder, deliveredShipment, eventCount] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      prisma.trackingEvent.count({ where: { shipmentId: shipment.id } }),
    ]);
    assert(
      deliveredOrder.status === OrderStatus.DELIVERED &&
        deliveredShipment.status === ShipmentStatus.DELIVERED &&
        eventCount === 3,
      'Shipment events did not idempotently advance the order',
    );
    console.log('✓ Shipment tracking advances order state and deduplicates provider events');

    const fulfilment = new FulfilmentService(
      prisma as unknown as PrismaService,
      {
        create: async () => ({ provider: 'test' }),
        items: () => [],
      } as unknown as ShippingProviderService,
      { record: async () => ({}) } as unknown as AuditService,
      {
        getOrThrow: () => 30,
      } as unknown as ConfigService,
    );
    const returnRequest = await fulfilment.requestReturn(userId, order.id, {
      reason: 'The delivered item was damaged and must be returned',
    });
    assert(
      returnRequest.status === ReturnStatus.REQUESTED && returnRequest.eligibleUntil > deliveredAt,
      'Eligible delivered order could not create a return',
    );
    console.log('✓ Delivered order creates a return within the fixed eligibility window');

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        hdfcTransactionId: `txn_phase7_${suffix}`,
        status: PaymentStatus.CAPTURED,
        amountPaise: 10_000,
      },
    });
    paymentId = payment.id;
    let providerCalls = 0;
    const providerRefund = (
      uniqueRequestId: string,
      amountPaise: number,
      status: 'PENDING' | 'SUCCESS',
    ): HdfcRefund => ({
      uniqueRequestId,
      status,
      outcome: status === 'SUCCESS' ? 'processed' : 'pending',
      amountPaise,
      reference: `rfnd_phase7_${suffix}`,
      raw: { unique_request_id: uniqueRequestId, status },
    });
    let lastRefundId = '';
    const gateway = {
      createRefund: async (_order: unknown, uniqueRequestId: string, amountPaise: number) => {
        providerCalls += 1;
        lastRefundId = uniqueRequestId;
        return { refunds: [providerRefund(uniqueRequestId, amountPaise, 'PENDING')] };
      },
      getOrderStatus: async () => ({
        refunds: [providerRefund(lastRefundId, 6_000, 'SUCCESS')],
      }),
    } as unknown as HdfcGatewayService;
    const refunds = new RefundsService(prisma as unknown as PrismaService, gateway, {
      record: async () => ({}),
    } as unknown as AuditService);
    const refundInput = {
      paymentId: payment.id,
      amountPaise: 6_000,
      idempotencyKey: `refund_${suffix}`,
    };
    const first = await refunds.create(userId, refundInput);
    const duplicate = await refunds.create(userId, refundInput);
    let excessiveRejected = false;
    try {
      await refunds.create(userId, {
        paymentId: payment.id,
        amountPaise: 5_000,
        idempotencyKey: `refund_extra_${suffix}`,
      });
    } catch {
      excessiveRejected = true;
    }
    assert(
      first.id === duplicate.id && providerCalls === 1 && excessiveRejected,
      'Refund idempotency or captured-amount bound failed',
    );
    const reconciliation = await refunds.reconcilePending();
    const reconciledRefund = await prisma.refund.findUniqueOrThrow({
      where: { id: first.id },
    });
    assert(
      reconciliation.processed === 1 && reconciledRefund.status === 'PROCESSED',
      'Pending refund reconciliation did not apply provider state',
    );
    console.log('✓ Refund creation is idempotent, bounded, and reconciled without a webhook');
  } finally {
    if (paymentId) {
      await prisma.refund.deleteMany({ where: { paymentId } });
      await prisma.payment.deleteMany({ where: { id: paymentId } });
    }
    if (orderId) {
      await prisma.returnRequest.deleteMany({ where: { orderId } });
    }
    if (shipmentId) {
      await prisma.trackingEvent.deleteMany({ where: { shipmentId } });
      await prisma.shipmentItem.deleteMany({ where: { shipmentId } });
      await prisma.shipment.deleteMany({ where: { id: shipmentId } });
    }
    if (orderId) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'order', aggregateId: orderId },
      });
      await prisma.order.deleteMany({ where: { id: orderId } });
    }
    if (quoteId) await prisma.checkoutQuote.deleteMany({ where: { id: quoteId } });
    if (cartId) await prisma.cart.deleteMany({ where: { id: cartId } });
    if (userId) await admin.auth.admin.deleteUser(userId);
    await prisma.$disconnect();
  }
}

void run()
  .then(() => console.log('Phase 7 live verification passed; temporary data was removed.'))
  .catch((error: unknown) => {
    console.error(
      `Phase 7 live verification failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  });
