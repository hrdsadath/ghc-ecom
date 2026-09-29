import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import {
  CartStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
  ProductStatus,
  QuoteStatus,
  ReservationStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const cartIds: string[] = [];
  const quoteIds: string[] = [];
  const orderIds: string[] = [];
  let categoryId: string | undefined;
  let productId: string | undefined;
  let warehouseId: string | undefined;
  let webhookId: string | undefined;

  try {
    const category = await prisma.category.create({
      data: {
        name: 'Phase 5 Live',
        slug: `phase5-${suffix}`,
        isPublished: true,
      },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        categoryId,
        name: 'Phase 5 Payment Product',
        slug: `phase5-product-${suffix}`,
        status: ProductStatus.PUBLISHED,
        publishedAt: new Date(),
        variants: {
          create: {
            sku: `P5-${suffix}`.toUpperCase(),
            name: 'Payment variant',
            pricePaise: 25_000,
          },
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    const variant = product.variants[0];
    assert(variant, 'Payment test variant was not created');
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `P5-${randomBytes(4).toString('hex').toUpperCase()}`,
        name: 'Phase 5 Warehouse',
      },
    });
    warehouseId = warehouse.id;
    await prisma.inventoryLevel.create({
      data: { warehouseId, variantId: variant.id, onHand: 5, reserved: 3 },
    });

    const confirmedCart = await prisma.cart.create({
      data: {
        guestTokenHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        items: { create: { variantId: variant.id, quantity: 2 } },
        reservations: {
          create: {
            variantId: variant.id,
            warehouseId,
            quantity: 2,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        },
      },
    });
    cartIds.push(confirmedCart.id);
    const confirmedQuote = await prisma.checkoutQuote.create({
      data: {
        cartId: confirmedCart.id,
        itemsSnapshot: [{ variantId: variant.id, sku: variant.sku, quantity: 2 }],
        addressSnapshot: { city: 'Mumbai', country: 'IN' },
        subtotalPaise: 50_000,
        discountPaise: 0,
        shippingPaise: 9_900,
        taxPaise: 9_000,
        totalPaise: 68_900,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    quoteIds.push(confirmedQuote.id);
    const confirmedOrder = await prisma.order.create({
      data: {
        orderNumber: `P5-PAID-${suffix}`,
        quoteId: confirmedQuote.id,
        cartId: confirmedCart.id,
        itemsSnapshot: confirmedQuote.itemsSnapshot as Prisma.InputJsonValue,
        addressSnapshot: confirmedQuote.addressSnapshot as Prisma.InputJsonValue,
        subtotalPaise: confirmedQuote.subtotalPaise,
        discountPaise: confirmedQuote.discountPaise,
        shippingPaise: confirmedQuote.shippingPaise,
        taxPaise: confirmedQuote.taxPaise,
        totalPaise: confirmedQuote.totalPaise,
        hdfcOrderId: `GHCP5${suffix.replace(/[^a-z0-9]/gi, '')}`.slice(0, 20),
        paymentExpiresAt: confirmedQuote.expiresAt,
      },
    });
    orderIds.push(confirmedOrder.id);
    await prisma.payment.create({
      data: {
        orderId: confirmedOrder.id,
        hdfcTransactionId: `txn_phase5_${suffix}`,
        status: PaymentStatus.CAPTURED,
        amountPaise: confirmedOrder.totalPaise,
        signatureVerified: true,
      },
    });

    await prisma.$executeRaw`select public.confirm_paid_order(${confirmedOrder.id}::uuid)`;
    await prisma.$executeRaw`select public.confirm_paid_order(${confirmedOrder.id}::uuid)`;
    const [paidOrder, paidCart, paidQuote, level, saleCount] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: confirmedOrder.id } }),
      prisma.cart.findUniqueOrThrow({ where: { id: confirmedCart.id } }),
      prisma.checkoutQuote.findUniqueOrThrow({ where: { id: confirmedQuote.id } }),
      prisma.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
      }),
      prisma.stockMovement.count({
        where: { referenceType: 'order', referenceId: confirmedOrder.id },
      }),
    ]);
    assert(
      paidOrder.status === OrderStatus.CONFIRMED &&
        paidCart.status === CartStatus.CONVERTED &&
        paidQuote.status === QuoteStatus.CONVERTED,
      'Paid order, cart, and quote states were not converted',
    );
    assert(
      level.onHand === 3 && level.reserved === 1 && saleCount === 1,
      'Repeated paid confirmation deducted inventory more than once',
    );
    console.log('✓ Paid confirmation is atomic and idempotent on the live database');

    const failedCart = await prisma.cart.create({
      data: {
        guestTokenHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        items: { create: { variantId: variant.id, quantity: 1 } },
        reservations: {
          create: {
            variantId: variant.id,
            warehouseId,
            quantity: 1,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        },
      },
    });
    cartIds.push(failedCart.id);
    const failedQuote = await prisma.checkoutQuote.create({
      data: {
        cartId: failedCart.id,
        itemsSnapshot: [{ variantId: variant.id, sku: variant.sku, quantity: 1 }],
        addressSnapshot: { city: 'Pune', country: 'IN' },
        subtotalPaise: 25_000,
        discountPaise: 0,
        shippingPaise: 9_900,
        taxPaise: 4_500,
        totalPaise: 39_400,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    quoteIds.push(failedQuote.id);
    const failedOrder = await prisma.order.create({
      data: {
        orderNumber: `P5-FAILED-${suffix}`,
        quoteId: failedQuote.id,
        cartId: failedCart.id,
        itemsSnapshot: failedQuote.itemsSnapshot as Prisma.InputJsonValue,
        addressSnapshot: failedQuote.addressSnapshot as Prisma.InputJsonValue,
        subtotalPaise: failedQuote.subtotalPaise,
        discountPaise: failedQuote.discountPaise,
        shippingPaise: failedQuote.shippingPaise,
        taxPaise: failedQuote.taxPaise,
        totalPaise: failedQuote.totalPaise,
        hdfcOrderId: `GHCF5${suffix.replace(/[^a-z0-9]/gi, '')}`.slice(0, 20),
        paymentExpiresAt: failedQuote.expiresAt,
      },
    });
    orderIds.push(failedOrder.id);

    await prisma.$executeRaw`select public.fail_pending_order(${failedOrder.id}::uuid)`;
    const [failedState, failedQuoteState, releasedReservation, releasedLevel] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: failedOrder.id } }),
      prisma.checkoutQuote.findUniqueOrThrow({ where: { id: failedQuote.id } }),
      prisma.inventoryReservation.findFirstOrThrow({
        where: { cartId: failedCart.id },
      }),
      prisma.inventoryLevel.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId, variantId: variant.id } },
      }),
    ]);
    assert(
      failedState.status === OrderStatus.PAYMENT_FAILED &&
        failedQuoteState.status === QuoteStatus.EXPIRED &&
        releasedReservation.status === ReservationStatus.RELEASED &&
        releasedLevel.reserved === 0,
      'Failed payment did not release its inventory reservation',
    );
    console.log('✓ Failed payment releases inventory and expires the quote');

    const providerEventId = `event_phase5_${suffix}`;
    const event = await prisma.webhookEvent.create({
      data: {
        providerEventId,
        eventType: 'ORDER_SUCCEEDED',
        payload: { event_name: 'ORDER_SUCCEEDED' },
      },
    });
    webhookId = event.id;
    let duplicateRejected = false;
    try {
      await prisma.webhookEvent.create({
        data: {
          providerEventId,
          eventType: 'ORDER_SUCCEEDED',
          payload: { event_name: 'ORDER_SUCCEEDED' },
        },
      });
    } catch (error) {
      duplicateRejected =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    }
    assert(duplicateRejected, 'Duplicate HDFC webhook event ID was not rejected');
    console.log('✓ HDFC webhook event IDs are unique in live webhook persistence');
  } finally {
    if (webhookId) await prisma.webhookEvent.deleteMany({ where: { id: webhookId } });
    if (orderIds.length) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.couponRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.stockMovement.deleteMany({
        where: { referenceType: 'order', referenceId: { in: orderIds } },
      });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (quoteIds.length) {
      await prisma.checkoutQuote.deleteMany({ where: { id: { in: quoteIds } } });
    }
    if (cartIds.length) {
      await prisma.inventoryReservation.deleteMany({ where: { cartId: { in: cartIds } } });
      await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
      await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
    }
    if (warehouseId) {
      await prisma.stockMovement.deleteMany({ where: { warehouseId } });
      await prisma.inventoryLevel.deleteMany({ where: { warehouseId } });
      await prisma.warehouse.delete({ where: { id: warehouseId } });
    }
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  }
}

void run()
  .then(() => console.log('Phase 5 live database verification passed; temporary data was removed.'))
  .catch((error: unknown) => {
    console.error(
      `Phase 5 live database verification failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  });
