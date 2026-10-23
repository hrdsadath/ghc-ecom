import { BadRequestException } from '@nestjs/common';
import { CartStatus, DiscountType } from '@prisma/client';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  it('uses the published price for standard delivery without hidden charges', async () => {
    const cart = {
      id: 'cart-id',
      userId: null,
      guestTokenHash: 'hash',
      status: CartStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-id',
          cartId: 'cart-id',
          variantId: 'variant-id',
          quantity: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          variant: {
            id: 'variant-id',
            sku: 'SKU-1',
            alias: 'GOLD SET',
            attributes: { color: 'Gold' },
            pricePaise: 1_100,
            imageLinks: [],
            product: {
              name: 'Stored Product',
              images: [],
            },
          },
        },
      ],
    };
    let quoteData: Record<string, unknown> | undefined;
    const transaction = {
      checkoutQuote: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(({ data }) => {
          quoteData = data;
          return Promise.resolve({ id: 'quote-id', ...data });
        }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ pendingQuoteId: null, expired: 0, reserved: 1 }]),
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const carts = {
      optionalUserId: jest.fn().mockResolvedValue(undefined),
      requireAccessibleCart: jest.fn().mockResolvedValue(cart),
    };
    const service = new CheckoutService(prisma as never, carts as never);

    await service.createQuote(
      {
        cartId: 'cart-id',
        contactEmail: 'guest@example.com',
        shippingAddress: {
          recipientName: 'Guest',
          phone: '9876543210',
          line1: '1 Test Road',
          line2: '',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'IN',
        },
      },
      undefined,
      'guest-token',
    );

    // One lock statement and one statement that expires old quotes and reserves stock.
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(quoteData).toMatchObject({
      subtotalPaise: 2_200,
      discountPaise: 0,
      shippingPaise: 0,
      taxPaise: 0,
      totalPaise: 2_200,
    });
    expect(quoteData?.itemsSnapshot).toEqual([
      expect.objectContaining({
        alias: 'GOLD SET',
        unitPricePaise: 1_100,
        quantity: 2,
        lineTotalPaise: 2_200,
      }),
    ]);
  });

  it('reuses the active quote behind an unexpired pending payment instead of replacing it', async () => {
    const activeQuote = {
      id: 'quote-id',
      cartId: 'cart-id',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60_000),
    };
    const transaction = {
      checkoutQuote: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(activeQuote),
        create: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ pendingQuoteId: 'quote-id', expired: 0, reserved: 0 }]),
    };
    const prisma = { $transaction: jest.fn((callback) => callback(transaction)) };
    const carts = {
      optionalUserId: jest.fn().mockResolvedValue(undefined),
      requireAccessibleCart: jest.fn().mockResolvedValue({
        id: 'cart-id',
        userId: null,
        items: [
          {
            id: 'item-id',
            cartId: 'cart-id',
            variantId: 'variant-id',
            quantity: 1,
            variant: {
              id: 'variant-id',
              sku: 'SKU',
              pricePaise: 10_000,
              attributes: { color: 'Gold' },
              imageLinks: [],
              product: { name: 'Product', images: [] },
            },
          },
        ],
      }),
    };
    const service = new CheckoutService(prisma as never, carts as never);

    await expect(
      service.createQuote(
        {
          cartId: 'cart-id',
          contactEmail: 'guest@example.com',
          shippingAddress: {
            recipientName: 'Guest',
            phone: '9876543210',
            line1: 'Road',
            line2: '',
            city: 'Pune',
            state: 'Maharashtra',
            postalCode: '411001',
            country: 'IN',
          },
        },
        undefined,
        'guest-token',
      ),
    ).resolves.toBe(activeQuote);
    expect(transaction.checkoutQuote.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'quote-id' },
    });
    expect(transaction.checkoutQuote.create).not.toHaveBeenCalled();
  });

  it('calculates percentage coupons in basis points', () => {
    const service = new CheckoutService({} as never, {} as never);
    const discount = (
      service as unknown as {
        discount: (
          coupon: { type: DiscountType; value: number; maximumDiscountPaise: null },
          subtotal: number,
        ) => number;
      }
    ).discount.bind(service);

    expect(
      discount({ type: DiscountType.PERCENT, value: 1_500, maximumDiscountPaise: null }, 1_000_000),
    ).toBe(150_000);
  });

  it('rejects a coupon after its global redemption limit is reached', async () => {
    const coupon = {
      id: 'coupon-id',
      code: 'LIMITED',
      type: DiscountType.FIXED,
      value: 1_000,
      minimumSubtotalPaise: 0,
      maximumDiscountPaise: null,
      usageLimit: 1,
      perUserLimit: null,
      startsAt: new Date(Date.now() - 1_000),
      endsAt: new Date(Date.now() + 60_000),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      coupon: { findFirst: jest.fn().mockResolvedValue(coupon) },
      couponRedemption: { count: jest.fn().mockResolvedValue(1) },
      checkoutQuote: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new CheckoutService(prisma as never, {} as never);
    const validateCoupon = (
      service as unknown as {
        validateCoupon: (
          code: string,
          subtotalPaise: number,
          userId: string | null,
        ) => Promise<unknown>;
      }
    ).validateCoupon.bind(service);

    await expect(validateCoupon('LIMITED', 10_000, null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.couponRedemption.count).toHaveBeenCalled();
  });

  it('takes the coupon lock after the cart lock, in the same statement', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ pendingQuoteId: null, expired: 0, reserved: 1 }]),
      coupon: { findFirst: jest.fn().mockResolvedValue(null) },
      checkoutQuote: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(transaction)) };
    const carts = {
      optionalUserId: jest.fn().mockResolvedValue(undefined),
      requireAccessibleCart: jest.fn().mockResolvedValue({
        id: 'cart-id',
        userId: null,
        items: [
          {
            variantId: 'variant-id',
            quantity: 1,
            variant: {
              sku: 'SKU',
              pricePaise: 10_000,
              attributes: {},
              imageLinks: [],
              product: { name: 'Product', images: [] },
            },
          },
        ],
      }),
    };
    const service = new CheckoutService(prisma as never, carts as never);

    await expect(
      service.createQuote(
        {
          cartId: 'cart-id',
          contactEmail: 'guest@example.com',
          couponCode: 'save10',
          shippingAddress: {
            recipientName: 'Guest',
            phone: '9876543210',
            line1: 'Road',
            line2: '',
            city: 'Pune',
            state: 'Maharashtra',
            postalCode: '411001',
            country: 'IN',
          },
        },
        undefined,
        'guest-token',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    const [, ...values] = transaction.$executeRaw.mock.calls[0];
    expect(values).toEqual(['cart-id', 'coupon:SAVE10', 'coupon:SAVE10']);
    expect(transaction.checkoutQuote.create).not.toHaveBeenCalled();
  });
});
