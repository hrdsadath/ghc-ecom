import { UnauthorizedException } from '@nestjs/common';
import { CartStatus } from '@prisma/client';
import { CartService } from './cart.service';

describe('CartService', () => {
  it('calculates cart totals only from stored variant prices', () => {
    const service = new CartService({} as never, {} as never);
    const cart = {
      id: 'cart-id',
      userId: null,
      guestTokenHash: 'hash',
      status: CartStatus.ACTIVE,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-id',
          cartId: 'cart-id',
          variantId: 'variant-id',
          quantity: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
          variant: {
            id: 'variant-id',
            sku: 'SKU-1',
            attributes: { color: 'Gold', size: 'Large', packQuantity: 2 },
            pricePaise: 12_500,
            imageLinks: [
              {
                image: {
                  thumbnailUrl: 'https://images.test/variant-thumbnail.webp',
                  sortOrder: 0,
                  createdAt: new Date(),
                },
              },
            ],
            product: {
              name: 'Stored Product',
              images: [{ thumbnailUrl: 'https://images.test/thumbnail.webp' }],
            },
          },
        },
      ],
    };

    expect(service.view(cart as never)).toMatchObject({
      subtotalPaise: 37_500,
      items: [
        {
          unitPricePaise: 12_500,
          lineTotalPaise: 37_500,
          imageUrl: 'https://images.test/variant-thumbnail.webp',
          optionLabel: 'Gold · Large · Pack of 2',
        },
      ],
    });
  });

  it('uses a shared product image when the selected variant has no image', () => {
    const service = new CartService({} as never, {} as never);
    const cart = {
      id: 'cart-id',
      status: CartStatus.ACTIVE,
      expiresAt: new Date(),
      items: [
        {
          id: 'item-id',
          variantId: 'variant-id',
          quantity: 1,
          variant: {
            sku: 'SKU-1',
            attributes: { color: 'Sage Green' },
            pricePaise: 12_500,
            imageLinks: [],
            product: {
              name: 'Stored Product',
              images: [{ thumbnailUrl: 'https://images.test/shared-thumbnail.webp' }],
            },
          },
        },
      ],
    };

    expect(service.view(cart as never).items[0].imageUrl).toBe(
      'https://images.test/shared-thumbnail.webp',
    );
  });

  it('rejects a cart request without querying an invalid UUID sentinel', async () => {
    const prisma = {
      cart: {
        findFirst: jest.fn(),
      },
    };
    const service = new CartService(prisma as never, {} as never);

    await expect(service.getCart('c3fd0b35-6f59-4d7b-be52-4b278bd0895c')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();
  });

  it('abandons an expired active user cart before creating a new one', async () => {
    const expiresAt = new Date('2026-10-01T00:00:00.000Z');
    const calls: string[] = [];
    const prisma = {
      cart: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockImplementation(() => {
          calls.push('updateMany');
          return Promise.resolve({ count: 1 });
        }),
        create: jest.fn().mockImplementation(() => {
          calls.push('create');
          return Promise.resolve({ id: 'new-cart', status: CartStatus.ACTIVE, expiresAt });
        }),
      },
    };
    const service = new CartService(prisma as never, {} as never);
    jest
      .spyOn(service as unknown as { optionalUserId: () => Promise<string> }, 'optionalUserId')
      .mockResolvedValue('user-id');

    const result = await service.createCart('Bearer token');

    expect(prisma.cart.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        status: CartStatus.ACTIVE,
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: CartStatus.ABANDONED },
    });
    expect(calls).toEqual(['updateMany', 'create']);
    expect(result.cart.id).toBe('new-cart');
  });

  it('sets a guest cart item with only a mutation and a joined cart read', async () => {
    const expiresAt = new Date('2026-09-01T00:00:00.000Z');
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            cartFound: true,
            variantFound: true,
            paymentPending: false,
            availableStock: 8,
            itemChanged: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            cartId: 'c3fd0b35-6f59-4d7b-be52-4b278bd0895c',
            status: 'active',
            expiresAt,
            itemId: 'item-id',
            variantId: 'd54f0e2c-51d8-4c25-98bd-1d84735cc937',
            sku: 'SKU-1',
            productName: 'Stored Product',
            color: 'Gold',
            imageUrl: null,
            quantity: 2,
            unitPricePaise: 12_500,
          },
        ]),
    };
    const service = new CartService(prisma as never, {} as never);

    await expect(
      service.setItem(
        'c3fd0b35-6f59-4d7b-be52-4b278bd0895c',
        { variantId: 'd54f0e2c-51d8-4c25-98bd-1d84735cc937', quantity: 2 },
        undefined,
        'guest-token',
      ),
    ).resolves.toMatchObject({ subtotalPaise: 25_000 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('removes a guest cart item with only a mutation and a joined cart read', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ cartFound: true, paymentPending: false, itemRemoved: true }])
        .mockResolvedValueOnce([
          {
            cartId: 'c3fd0b35-6f59-4d7b-be52-4b278bd0895c',
            status: 'ACTIVE',
            expiresAt: new Date('2026-09-01T00:00:00.000Z'),
            itemId: null,
            variantId: null,
            sku: null,
            productName: null,
            color: null,
            imageUrl: null,
            quantity: null,
            unitPricePaise: null,
          },
        ]),
    };
    const service = new CartService(prisma as never, {} as never);

    await expect(
      service.removeItem(
        'c3fd0b35-6f59-4d7b-be52-4b278bd0895c',
        'd54f0e2c-51d8-4c25-98bd-1d84735cc937',
        undefined,
        'guest-token',
      ),
    ).resolves.toMatchObject({ items: [], subtotalPaise: 0 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
