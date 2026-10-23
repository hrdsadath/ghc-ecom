import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  /** The SQL text of the n-th $queryRaw call, with nested fragments expanded. */
  const rawSql = (mock: jest.Mock, call = 0): Prisma.Sql =>
    Prisma.sql(...(mock.mock.calls[call] as [readonly string[], ...unknown[]]));

  it('lists only published products in published categories with active variants', async () => {
    const products = [{ id: 'product-id', variants: [], images: [] }];
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'product-id', total: 1 }]),
      product: { findMany: jest.fn().mockResolvedValue(products) },
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
    const ranking = rawSql(prisma.$queryRaw);
    expect(ranking.sql).toContain("product.status = 'published'");
    expect(ranking.sql).toContain('product.published_at <= now()');
    expect(ranking.sql).toContain('category.is_published');
    expect(ranking.sql).toContain('variant.is_active');
    expect(ranking.values).toEqual([20, 0]);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        relationLoadStrategy: 'join',
        where: { id: { in: ['product-id'] } },
        select: expect.objectContaining({
          variants: expect.objectContaining({ where: { isActive: true } }),
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('filters the ranking by category and an escaped search term', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: { findMany: jest.fn() },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(
      service.listPublicProducts({ page: 1, limit: 24, category: 'tea-sets', q: '50%_off' }),
    ).resolves.toMatchObject({ items: [], total: 0 });
    const ranking = rawSql(prisma.$queryRaw);
    expect(ranking.text).toContain('category.slug = $1');
    expect(ranking.text).toContain('product.name ilike $2 or product.short_description ilike $3');
    expect(ranking.values).toEqual(['tea-sets', '%50\\%\\_off%', '%50\\%\\_off%', 24, 0]);
    // No rows on the first page means no matches; there is nothing else to load.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
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
    const products = [{ id: 'product-id', variants: [], images: [] }];
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'product-id', total: 1 }]),
      product: { findMany: jest.fn().mockResolvedValue(products) },
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
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(redis.setJson).toHaveBeenCalledTimes(1);
    // The version key is read once and remembered briefly, not before every hit.
    expect(redis.get).toHaveBeenCalledTimes(1);
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

  it('keeps the ranking order and counts matches past the last page', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        // Ranked in SQL: in stock first, then newest.
        .mockResolvedValueOnce([
          { id: 'in-stock-old', total: 4 },
          { id: 'in-stock-oldest', total: 4 },
          { id: 'sold-out-new', total: 4 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 4 }]),
      product: {
        // The card query returns rows in any order.
        findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
          [...args.where.id.in].reverse().map((id) => ({ id, variants: [], images: [] })),
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
    const pastEnd = await service.listPublicProducts({ page: 3, limit: 3 });

    expect(first.items.map((item) => item.id)).toEqual([
      'in-stock-old',
      'in-stock-oldest',
      'sold-out-new',
    ]);
    expect(first.total).toBe(4);
    expect(rawSql(prisma.$queryRaw, 1).values).toEqual([3, 6]);
    expect(pastEnd).toMatchObject({ items: [], total: 4 });
    expect(rawSql(prisma.$queryRaw, 2).sql).toContain('count(*)::integer as total');
  });

  it('ranks an id list with in-stock products first from a single query', async () => {
    const card = (id: string, onHand: number): Record<string, unknown> => ({
      id,
      images: [],
      variants: [{ id: `${id}-variant`, inventoryLevels: [{ onHand, reserved: 0 }] }],
    });
    const prisma = {
      product: {
        // Newest first, as ordered by the query.
        findMany: jest
          .fn()
          .mockResolvedValue([
            card('sold-out-new', 0),
            card('in-stock-old', 2),
            card('in-stock-oldest', 1),
          ]),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );
    const ids = [
      '2b4f4c3e-9a57-4a39-9d5d-6c8f0b7a1e21',
      '3c5f4c3e-9a57-4a39-9d5d-6c8f0b7a1e22',
      '4d6f4c3e-9a57-4a39-9d5d-6c8f0b7a1e23',
    ];

    const page = await service.listPublicProducts({ page: 1, limit: 2, ids });

    expect(page.items.map((item) => item.id)).toEqual(['in-stock-old', 'in-stock-oldest']);
    expect(page.total).toBe(3);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
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
    // An id list loads its cards in a single query, without the separate ranking pass.
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ids } }),
        select: expect.objectContaining({ shortDescription: true }),
      }),
    );
    // Cards leave out what only the product page and admin read.
    const { select } = prisma.product.findMany.mock.calls[0][0];
    for (const field of ['description', 'attributes', 'seoTitle', 'seoDescription', 'videos']) {
      expect(select).not.toHaveProperty(field);
    }
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

  it('keeps the category slug (and storefront URLs) when its name changes', async () => {
    const previous = { id: 'category-id', name: 'Tea Sets', slug: 'tea-sets' };
    const category = { id: 'category-id', name: 'Dining Sets', slug: 'tea-sets' };
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
      data: { name: 'Dining Sets' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'category',
        entityId: 'category-id',
        metadata: {
          entityLabel: 'Dining Sets',
          changes: {
            name: { before: 'Tea Sets', after: 'Dining Sets' },
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

  const uniqueViolation = (target: string): Prisma.PrismaClientKnownRequestError =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: [target] },
    });

  const productRecord = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'product-id',
    name: 'Tea Set',
    slug: 'tea-set',
    categoryId: 'category-id',
    category: { name: 'Tea Sets' },
    status: 'DRAFT',
    description: null,
    material: null,
    publishedAt: null,
    variants: [],
    images: [],
    videos: [],
    ...overrides,
  });

  it('gives a duplicate product name the next free URL instead of a conflict', async () => {
    const prisma = {
      product: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ slug: 'tea-set' }])
          .mockResolvedValueOnce([{ slug: 'tea-set' }, { slug: 'tea-set-2' }]),
        create: jest
          .fn()
          .mockRejectedValueOnce(uniqueViolation('slug'))
          .mockImplementation(({ data }) => Promise.resolve(productRecord({ slug: data.slug }))),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    const created = await service.createProduct(
      'actor-id',
      { categoryId: 'category-id', name: 'Tea Set', slug: 'tea-set' },
      {},
    );

    // The first free slug was taken by a concurrent save, so the next one is used.
    expect(prisma.product.create.mock.calls.map(([call]) => call.data.slug)).toEqual([
      'tea-set-2',
      'tea-set-3',
    ]);
    expect(created.slug).toBe('tea-set-3');
  });

  it('keeps the original publish date when a published product is saved again', async () => {
    const publishedAt = new Date('2026-01-01T00:00:00.000Z');
    const prisma = {
      product: {
        findUnique: jest
          .fn()
          .mockResolvedValue(productRecord({ status: 'PUBLISHED', publishedAt })),
        update: jest.fn().mockResolvedValue(productRecord({ status: 'PUBLISHED', publishedAt })),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await service.updateProduct('actor-id', 'product-id', { status: 'PUBLISHED' as never }, {});

    expect(prisma.product.update.mock.calls[0][0].data.publishedAt).toBeUndefined();
  });

  it('stamps the publish date when a draft is published and clears it when unpublished', async () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(productRecord({ status: 'DRAFT' })),
        update: jest.fn().mockResolvedValue(productRecord()),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await service.updateProduct('actor-id', 'product-id', { status: 'PUBLISHED' as never }, {});
    await service.updateProduct('actor-id', 'product-id', { status: 'DRAFT' as never }, {});

    expect(prisma.product.update.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date);
    expect(prisma.product.update.mock.calls[1][0].data.publishedAt).toBeNull();
  });

  it('restores a product without a material (import rollback) instead of crashing', async () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(productRecord({ material: 'Ceramic' })),
        update: jest.fn().mockResolvedValue(productRecord()),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await service.updateProduct(
      'actor-id',
      'product-id',
      { material: null, shortDescription: null, description: null, name: null as never },
      {},
    );

    const { data } = prisma.product.update.mock.calls[0][0];
    expect(data).toMatchObject({ material: null, shortDescription: null, description: null });
    // A required column ignores null rather than failing in the database.
    expect(data.name).toBeUndefined();
  });

  it('removes a variant colour and swatch when colour is cleared', async () => {
    const existing = {
      id: 'variant-id',
      sku: 'SKU-1',
      alias: null,
      pricePaise: 1_000,
      compareAtPricePaise: null,
      isActive: true,
      attributes: { color: 'Gold', colorHex: '#C5A059', size: 'Large' },
    };
    const prisma = {
      productVariant: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(existing),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    // The admin form still sends the old attributes alongside the cleared colour.
    await service.updateVariant(
      'actor-id',
      'variant-id',
      { color: null, attributes: existing.attributes, size: null, packQuantity: null },
      {},
    );

    expect(prisma.productVariant.update.mock.calls[0][0].data.attributes).toEqual({});
  });

  it('keeps an image deletion when storage cleanup fails afterwards', async () => {
    const image = {
      id: 'image-id',
      productId: 'product-id',
      altText: 'Gold set',
      sortOrder: 0,
      sourceFilename: 'gold.png',
      thumbnailPath: 't',
      mediumPath: 'm',
      largePath: 'l',
    };
    const prisma = {
      productImage: {
        findFirst: jest.fn().mockResolvedValue(image),
        delete: jest.fn().mockResolvedValue(image),
      },
    };
    supabase.removeProductImages.mockRejectedValueOnce(new Error('storage down'));
    audit.record.mockResolvedValue({});
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );
    const warn = jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      service.deleteProductImage('actor-id', 'product-id', 'image-id', {}),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('t, m, l'));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'catalogue.image.deleted' }),
    );
  });

  it('finds a product image previously imported from the same Drive file only', async () => {
    const fileId = 'abc_def-123456';
    const prisma = {
      productImage: {
        findMany: jest.fn().mockResolvedValue([
          // An underscore is a LIKE wildcard, so the database can return a near miss.
          { id: 'near-miss', sourceFilename: 'google-drive-abcXdef-123456--photo.png' },
          { id: 'match', sourceFilename: `google-drive-${fileId}--photo.png` },
        ]),
      },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(service.findGoogleDriveImage('product-id', fileId)).resolves.toMatchObject({
      id: 'match',
    });
    expect(prisma.productImage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: 'product-id',
          OR: [
            { sourceFilename: { startsWith: `google-drive-${fileId}--` } },
            { sourceFilename: { startsWith: `google-drive-${fileId}.` } },
          ],
        },
      }),
    );
  });

  it('reports a duplicate category name in plain words', async () => {
    const prisma = { category: { create: jest.fn().mockRejectedValue(uniqueViolation('slug')) } };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(service.createCategory('actor-id', { name: 'Tea Sets' }, {})).rejects.toEqual(
      new ConflictException('A category with this name already exists'),
    );
  });

  it('pages the admin product list newest first with escaped search across names, slugs, SKUs and aliases', async () => {
    const cards = [
      { id: 'older', images: [], variants: [] },
      { id: 'newer', images: [], variants: [] },
    ];
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'newer', total: 42 },
        { id: 'older', total: 42 },
      ]),
      product: { findMany: jest.fn().mockResolvedValue(cards) },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );
    const categoryId = '3d659f24-eebd-4245-a36d-c0e0d64b028f';

    const result = await service.listAdminProductPage({
      page: 3,
      limit: 20,
      q: '50%_off',
      status: 'DRAFT' as never,
      category: categoryId,
    });

    expect(result).toMatchObject({ total: 42, page: 3, limit: 20 });
    expect(result.items.map((item) => item.id)).toEqual(['newer', 'older']);
    const ranking = rawSql(prisma.$queryRaw);
    expect(ranking.text).toContain('product.status = $1::public.product_status');
    expect(ranking.text).toContain('product.category_id = $2::uuid');
    expect(ranking.text).toMatch(/product\.name ilike \$3\s+or product\.slug ilike \$4/);
    expect(ranking.text).toContain('variant.sku ilike $5 or variant.alias ilike $6');
    expect(ranking.text).toContain('order by product.created_at desc, product.id desc');
    const pattern = '%50\\%\\_off%';
    expect(ranking.values).toEqual([
      'draft',
      categoryId,
      pattern,
      pattern,
      pattern,
      pattern,
      20,
      40,
    ]);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['newer', 'older'] } } }),
    );
  });

  it('counts admin matches separately when the page is past the last one', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 7 }]),
      product: { findMany: jest.fn() },
    };
    const service = new CatalogueService(
      prisma as never,
      audit as never,
      supabase as never,
      imageProcessor as never,
    );

    await expect(service.listAdminProductPage({ page: 5, limit: 50 })).resolves.toEqual({
      items: [],
      total: 7,
      page: 5,
      limit: 50,
    });
    expect(rawSql(prisma.$queryRaw, 1).text).toContain('select count(*)::integer as total');
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  describe('reorderProductImages', () => {
    interface ImageRow {
      id: string;
      productId: string;
      altText: string;
      sourceFilename: string;
      sortOrder: number;
      variantLinks: { variantId: string }[];
    }
    interface Setup {
      service: CatalogueService;
      transaction: {
        $queryRaw: jest.Mock;
        $executeRaw: jest.Mock;
        productImage: { findMany: jest.Mock };
      };
      redis: { increment: jest.Mock };
      after: ImageRow[];
    }
    const image = (id: string, sortOrder: number): ImageRow => ({
      id,
      productId: 'product-id',
      altText: `Image ${id}`,
      sourceFilename: `${id}.webp`,
      sortOrder,
      variantLinks: [],
    });
    const setup = (rowsChanged: number): Setup => {
      const before = [image('a', 0), image('b', 0), image('c', 1)];
      const after = [image('c', 0), image('a', 1), image('b', 2)];
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn().mockResolvedValue(rowsChanged),
        productImage: {
          findMany: jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
        },
      };
      const prisma = {
        product: { findUnique: jest.fn().mockResolvedValue({ id: 'product-id', name: 'Tea Set' }) },
        $transaction: jest.fn((callback) => callback(transaction)),
      };
      const redis = { increment: jest.fn() };
      const service = new CatalogueService(
        prisma as never,
        audit as never,
        supabase as never,
        imageProcessor as never,
        videoProcessor as never,
        redis as never,
      );
      return { service, transaction, redis, after };
    };

    it('writes positions 0..n-1 in one statement, audits once and expires the storefront cache', async () => {
      const { service, transaction, redis, after } = setup(3);

      await expect(
        service.reorderProductImages('actor-id', 'product-id', ['c', 'a', 'b'], {}),
      ).resolves.toEqual(after);

      expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
      expect(rawSql(transaction.$queryRaw).text).toContain('for update');
      expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
      const update = rawSql(transaction.$executeRaw);
      expect(update.text).toContain('set sort_order = ordered.position - 1');
      expect(update.text).toContain('with ordinality');
      expect(update.values).toEqual([['c', 'a', 'b'], 'product-id']);
      expect(redis.increment).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'catalogue.product.images_reordered',
          entityType: 'product',
          entityId: 'product-id',
          metadata: {
            entityLabel: 'Tea Set',
            changes: {
              imageOrder: {
                before: ['a.webp', 'b.webp', 'c.webp'],
                after: ['c.webp', 'a.webp', 'b.webp'],
              },
            },
          },
        }),
      );
    });

    it.each([
      ['an image of another product', ['c', 'a', 'x']],
      ['a missing image', ['c', 'a']],
      ['a repeated image', ['c', 'a', 'a']],
    ])('refuses an order that names %s', async (_label, imageIds) => {
      const { service, transaction, redis } = setup(0);

      await expect(
        service.reorderProductImages('actor-id', 'product-id', imageIds, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction.$executeRaw).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(redis.increment).not.toHaveBeenCalled();
    });

    it('neither audits nor expires the cache when the order is unchanged', async () => {
      const { service, redis } = setup(0);

      await service.reorderProductImages('actor-id', 'product-id', ['a', 'b', 'c'], {});

      expect(audit.record).not.toHaveBeenCalled();
      expect(redis.increment).not.toHaveBeenCalled();
    });

    it('reports an unknown product as not found', async () => {
      const prisma = { product: { findUnique: jest.fn().mockResolvedValue(null) } };
      const service = new CatalogueService(
        prisma as never,
        audit as never,
        supabase as never,
        imageProcessor as never,
      );

      await expect(
        service.reorderProductImages('actor-id', 'missing', ['a'], {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
