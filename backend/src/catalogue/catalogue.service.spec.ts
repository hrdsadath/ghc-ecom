import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { CatalogueService } from './catalogue.service';

describe('CatalogueService', () => {
  const audit = { record: jest.fn() };
  const supabase = {
    uploadProductImage: jest.fn(),
    removeProductImages: jest.fn(),
    getProductImagePublicUrl: jest.fn(),
    uploadProductVideo: jest.fn(),
    getProductVideoPublicUrl: jest.fn(),
  };
  const imageProcessor = { process: jest.fn() };
  const videoProcessor = { process: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only published products in published categories with active variants', async () => {
    const products = [
      { id: 'product-id', status: ProductStatus.PUBLISHED, variants: [], images: [] },
    ];
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue(products),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn((operations) => Promise.all(operations)),
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(service.listPublicProducts({ page: 1, limit: 20 })).resolves.toEqual({
      items: products,
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(prisma.product.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        relationLoadStrategy: 'join',
        where: expect.objectContaining({
          status: ProductStatus.PUBLISHED,
          category: { isPublished: true },
        }),
        select: expect.objectContaining({
          variants: expect.objectContaining({ where: { isActive: true } }),
        }),
      }),
    );
    expect(prisma.product.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        relationLoadStrategy: 'join',
        where: { id: { in: ['product-id'] } },
        include: expect.objectContaining({
          variants: expect.objectContaining({ where: { isActive: true } }),
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not return an unpublished product from the public detail API', async () => {
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(service.getPublicProduct('draft-product')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ relationLoadStrategy: 'join' }),
    );
  });

  it('serves repeated public catalogue requests from Redis', async () => {
    const products = [
      { id: 'product-id', status: ProductStatus.PUBLISHED, variants: [], images: [] },
    ];
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue(products),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const values = new Map<string, unknown>();
    const redis = {
      getJson: jest.fn(async (key: string) => values.get(key) ?? null),
      setJson: jest.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      get: jest.fn().mockResolvedValue('1'),
      increment: jest.fn(),
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
      videoProcessor as never,
      redis as never,
    );

    await service.listPublicProducts({ page: 1, limit: 20 });
    await service.listPublicProducts({ page: 1, limit: 20 });

    // One ranking query plus one page-of-cards query, both from the first request only.
    expect(prisma.product.findMany).toHaveBeenCalledTimes(2);
    expect(redis.setJson).toHaveBeenCalledTimes(1);
  });

  it('serves a stale public entry immediately and refreshes it once in the background', async () => {
    let finishRefresh: (value: unknown) => void = () => undefined;
    const prisma = {
      category: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'old' }])
          .mockReturnValueOnce(
            new Promise((resolve) => {
              finishRefresh = resolve;
            }),
          ),
      },
    };
    const values = new Map<string, unknown>();
    const redis = {
      getJson: jest.fn(async (key: string) => values.get(key) ?? null),
      setJson: jest.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      get: jest.fn().mockResolvedValue('1'),
      increment: jest.fn(),
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
      videoProcessor as never,
      redis as never,
    );
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    await expect(service.listPublicCategories()).resolves.toEqual([{ id: 'old' }]);
    now.mockReturnValue(1_000 + 31_000);
    await expect(service.listPublicCategories()).resolves.toEqual([{ id: 'old' }]);
    await expect(service.listPublicCategories()).resolves.toEqual([{ id: 'old' }]);
    finishRefresh([{ id: 'new' }]);
    await new Promise((resolve) => setImmediate(resolve));
    await expect(service.listPublicCategories()).resolves.toEqual([{ id: 'new' }]);

    expect(prisma.category.findMany).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('lists in-stock products ahead of sold-out ones across pages', async () => {
    const stock = (onHand: number, reserved = 0) => [{ inventoryLevels: [{ onHand, reserved }] }];
    // Newest first, as returned by the ranking query.
    const ranked = [
      { id: 'sold-out-new', variants: stock(0) },
      { id: 'reserved-out', variants: stock(2, 2) },
      { id: 'in-stock-old', variants: stock(4) },
      { id: 'in-stock-oldest', variants: [...stock(0), ...stock(1)] },
    ];
    const prisma = {
      product: {
        findMany: jest.fn(async (args: { select?: unknown; where: { id?: { in: string[] } } }) =>
          args.select
            ? ranked
            : [...(args.where.id?.in ?? [])].reverse().map((id) => ({ id, variants: [], images: [] })),
        ),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    const first = await service.listPublicProducts({ page: 1, limit: 3 });
    const second = await service.listPublicProducts({ page: 2, limit: 3 });

    expect(first.items.map((item) => item.id)).toEqual(['in-stock-old', 'in-stock-oldest', 'sold-out-new']);
    expect(second.items.map((item) => item.id)).toEqual(['reserved-out']);
    expect(first.total).toBe(4);
  });

  it('lists only card images and filters by requested ids', async () => {
    const shared = { id: 'shared', variantLinks: [] };
    const extraShared = { id: 'extra-shared', variantLinks: [] };
    const goldFirst = { id: 'gold-1', variantLinks: [{ variantId: 'gold' }] };
    const goldSecond = { id: 'gold-2', variantLinks: [{ variantId: 'gold' }] };
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-id',
            images: [goldFirst, shared, goldSecond, extraShared],
            variants: [{ id: 'gold', inventoryLevels: [{ onHand: 5, reserved: 2 }] }],
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );
    const ids = ['2b4f4c3e-9a57-4a39-9d5d-6c8f0b7a1e21'];

    const result = await service.listPublicProducts({ page: 1, limit: 20, ids });

    expect(result.items[0].images.map((image) => image.id)).toEqual(['gold-1', 'shared']);
    expect(result.items[0].variants[0].availableStock).toBe(3);
    expect(prisma.product.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ids } }) }),
    );
    expect(prisma.product.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        include: expect.not.objectContaining({ videos: expect.anything() }),
      }),
    );
  });

  it('normalizes category names before saving them', async () => {
    const category = { id: 'category-id', name: 'Tea Sets', slug: 'tea-sets' };
    const prisma = {
      category: { create: jest.fn().mockResolvedValue(category) },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.createCategory('actor-id', { name: '  Tea   Sets  ', isPublished: true }, {}),
    ).resolves.toEqual(category);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Tea Sets', slug: 'tea-sets' }),
    });
  });

  it('regenerates the internal category slug when its name changes', async () => {
    const previous = { id: 'category-id', name: 'Tea Sets', slug: 'tea-sets' };
    const category = { id: 'category-id', name: 'Dining Sets', slug: 'dining-sets' };
    const prisma = {
      category: {
        findUnique: jest.fn().mockResolvedValue(previous),
        update: jest.fn().mockResolvedValue(category),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.updateCategory('actor-id', 'category-id', { name: '  Dining Sets  ' }, {}),
    ).resolves.toEqual(category);
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'category-id' },
      data: expect.objectContaining({ name: 'Dining Sets', slug: 'dining-sets' }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'category',
        entityId: 'category-id',
        metadata: {
          entityLabel: 'Dining Sets',
          changes: {
            name: { before: 'Tea Sets', after: 'Dining Sets' },
            slug: { before: 'tea-sets', after: 'dining-sets' },
          },
        },
      }),
    );
  });

  it('rejects placeholder categories from the public catalogue', async () => {
    const prisma = { category: { create: jest.fn() } };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.createCategory('actor-id', { name: 'Test', isPublished: true }, {}),
    ).rejects.toThrow('Placeholder categories cannot be published');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('rejects a compare-at price lower than the selling price', async () => {
    const prisma = { productVariant: { create: jest.fn() } };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.createVariant(
        'actor-id',
        'product-id',
        {
          sku: 'SKU-1',
          pricePaise: 10_000,
          compareAtPricePaise: 9_000,
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productVariant.create).not.toHaveBeenCalled();
  });

  it('creates zero-stock inventory levels for a new variant in every warehouse', async () => {
    const variant = { id: 'variant-id', sku: 'SKU-1' };
    const transaction = {
      productVariant: { create: jest.fn().mockResolvedValue(variant) },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([{ id: 'warehouse-a' }, { id: 'warehouse-b' }]),
      },
      inventoryLevel: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.createVariant(
        'actor-id',
        'product-id',
        {
          sku: 'sku-1',
          alias: 'Gold display — popular',
          color: ' Green ',
          size: ' Large ',
          packQuantity: 2,
          pricePaise: 10_000,
        },
        {},
      ),
    ).resolves.toEqual(variant);

    expect(transaction.productVariant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sku: 'SKU-1',
        alias: 'Gold display — popular',
        attributes: expect.objectContaining({ color: 'Green', size: 'Large', packQuantity: 2 }),
      }),
    });

    expect(transaction.inventoryLevel.createMany).toHaveBeenCalledWith({
      data: [
        { warehouseId: 'warehouse-a', variantId: 'variant-id' },
        { warehouseId: 'warehouse-b', variantId: 'variant-id' },
      ],
    });
  });

  it('maps a legacy barcode payload to alias without forwarding barcode to Prisma', async () => {
    const variant = { id: 'variant-id', sku: '16187-29-GREY', alias: '16187-29-GREY' };
    const transaction = {
      productVariant: { create: jest.fn().mockResolvedValue(variant) },
      warehouse: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryLevel: { createMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(transaction)) };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await service.createVariant(
      'actor-id',
      'product-id',
      { sku: '16187-29-GREY', barcode: '16187-29-GREY', pricePaise: 690_000 } as never,
      {},
    );

    expect(transaction.productVariant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sku: '16187-29-GREY',
        alias: '16187-29-GREY',
      }),
    });
    expect(transaction.productVariant.create.mock.calls[0][0].data).not.toHaveProperty('barcode');
  });

  it('reports a duplicate SKU as a catalogue-wide conflict', async () => {
    const duplicateSku = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['sku'] },
    });
    const prisma = { $transaction: jest.fn().mockRejectedValue(duplicateSku) };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.createVariant(
        'actor-id',
        'product-id',
        { sku: 'EXISTING-SKU', alias: 'Duplicate aliases are allowed', pricePaise: 10_000 },
        {},
      ),
    ).rejects.toEqual(new ConflictException('SKU must be unique across the catalogue'));
  });

  it('deletes automatically-created zero-stock levels before deleting an unused product', async () => {
    const transaction = {
      product: {
        findUnique: jest.fn().mockResolvedValue({ variants: [{ id: 'variant-id' }] }),
        delete: jest.fn().mockResolvedValue({}),
      },
      inventoryLevel: {
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      cartItem: { count: jest.fn().mockResolvedValue(0) },
      inventoryReservation: { count: jest.fn().mockResolvedValue(0) },
      stockMovement: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = {
      productImage: { findMany: jest.fn().mockResolvedValue([]) },
      productVideo: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    audit.record.mockResolvedValue({});
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await service.deleteProduct('actor-id', 'product-id', {});

    expect(transaction.inventoryLevel.deleteMany).toHaveBeenCalledWith({
      where: { variantId: { in: ['variant-id'] } },
    });
    expect(transaction.product.delete).toHaveBeenCalledWith({ where: { id: 'product-id' } });
  });

  it('stores uploaded videos as browser-ready MP4 files', async () => {
    const video = { id: 'video-id', url: 'https://storage.example.com/video.mp4' };
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'product-id' }) },
      productVideo: { create: jest.fn().mockResolvedValue(video) },
    };
    videoProcessor.process.mockResolvedValue({
      buffer: Buffer.from('converted-video'),
      mimetype: 'video/mp4',
    });
    supabase.getProductVideoPublicUrl.mockReturnValue(video.url);
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
      videoProcessor as never,
    );

    await expect(
      service.uploadProductVideo(
        'actor-id',
        'product-id',
        {
          buffer: Buffer.from('mov-source'),
          mimetype: 'video/quicktime',
          originalname: 'product.mov',
        } as Express.Multer.File,
        { altText: 'Product walkthrough' },
        {},
      ),
    ).resolves.toEqual(video);

    expect(supabase.uploadProductVideo).toHaveBeenCalledWith(
      expect.stringMatching(/^product-id\/.+\/source\.mp4$/),
      Buffer.from('converted-video'),
      'video/mp4',
    );
    expect(prisma.productVideo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceFilename: 'product.mov',
        sourceMimeType: 'video/mp4',
        storagePath: expect.stringMatching(/^product-id\/.+\/source\.mp4$/),
      }),
    });
  });

  it('assigns a stored product image to multiple variants owned by that product', async () => {
    const image = {
      id: 'image-id',
      productId: 'product-id',
      altText: 'Green set',
      sortOrder: 0,
      sourceFilename: 'green.webp',
      variantLinks: [],
    };
    const updated = {
      ...image,
      variantLinks: [{ variantId: 'variant-id-1' }, { variantId: 'variant-id-2' }],
    };
    const transaction = {
      productImage: {
        update: jest.fn().mockResolvedValue(image),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      productImageVariant: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      productImage: { findFirst: jest.fn().mockResolvedValue(image) },
      productVariant: { count: jest.fn().mockResolvedValue(2) },
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.updateProductImage(
        'actor-id',
        'product-id',
        'image-id',
        { variantIds: ['variant-id-1', 'variant-id-2'] },
        {},
      ),
    ).resolves.toEqual(updated);
    expect(prisma.productVariant.count).toHaveBeenCalledWith({
      where: { id: { in: ['variant-id-1', 'variant-id-2'] }, productId: 'product-id' },
    });
    expect(transaction.productImageVariant.createMany).toHaveBeenCalledWith({
      data: [
        { imageId: 'image-id', variantId: 'variant-id-1' },
        { imageId: 'image-id', variantId: 'variant-id-2' },
      ],
      skipDuplicates: true,
    });
    expect(supabase.uploadProductImage).not.toHaveBeenCalled();
  });

  it('rejects an image assignment to another product variant', async () => {
    const prisma = {
      productImage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'image-id',
          productId: 'product-id',
          variantLinks: [],
        }),
        update: jest.fn(),
      },
      productVariant: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.updateProductImage(
        'actor-id',
        'product-id',
        'image-id',
        { variantId: 'other-variant-id' },
        {},
      ),
    ).rejects.toThrow('An image variant does not belong to this product');
    expect(prisma.productImage.update).not.toHaveBeenCalled();
  });
});
