import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Category,
  Prisma,
  Product,
  ProductImage,
  ProductStatus,
  ProductVariant,
  ProductVideo,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { auditChangeMetadata } from '../audit/audit-change';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ImageMetadataDto } from './dto/image-metadata.dto';
import { ListAdminProductsDto } from './dto/list-admin-products.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductImageMetadataDto } from './dto/product-image-metadata.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { googleDriveSourcePrefixes } from './google-drive-image.service';
import { ImageDerivative, ImageProcessorService } from './image-processor.service';
import { VideoProcessorService } from './video-processor.service';

const productInclude = {
  category: true,
  variants: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      inventoryLevels: {
        where: { warehouse: { isActive: true } },
        select: { onHand: true, reserved: true },
      },
    },
  },
  images: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: { variantLinks: { select: { variantId: true } } },
  },
  videos: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
} satisfies Prisma.ProductInclude;

// Listings (storefront grids, search, wishlist, admin tables) only render a card
// image per variant, so they skip videos and the storage/source image columns.
const productCardInclude = {
  category: true,
  variants: productInclude.variants,
  images: {
    orderBy: productInclude.images.orderBy,
    select: {
      id: true,
      productId: true,
      altText: true,
      sortOrder: true,
      thumbnailUrl: true,
      mediumUrl: true,
      variantLinks: { select: { variantId: true } },
    },
  },
} satisfies Prisma.ProductInclude;

// Storefront cards (grids, search, wishlist) read only these fields, so public listings skip
// the long description, SEO fields and timestamps that only the product page and admin use.
const publicCardSelect = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  category: { select: { id: true, name: true, slug: true } },
  variants: {
    where: { isActive: true },
    orderBy: productInclude.variants.orderBy,
    select: {
      id: true,
      sku: true,
      pricePaise: true,
      compareAtPricePaise: true,
      attributes: true,
      isActive: true,
      inventoryLevels: productInclude.variants.include.inventoryLevels,
    },
  },
  images: productCardInclude.images,
} satisfies Prisma.ProductSelect;

type PublicCardWithInventory = Prisma.ProductGetPayload<{ select: typeof publicCardSelect }>;

interface CardShape {
  images: { variantLinks: { variantId: string }[] }[];
  variants: { id: string; inventoryLevels: { onHand: number; reserved: number }[] }[];
}

type ProductWithInventory = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

type ProductCardWithInventory = Prisma.ProductGetPayload<{
  include: typeof productCardInclude;
}>;

type WithAvailableStock<T extends { variants: { inventoryLevels: unknown }[] }> = Omit<
  T,
  'variants'
> & {
  variants: (Omit<T['variants'][number], 'inventoryLevels'> & { availableStock: number })[];
};

export type CatalogueProductCard = WithAvailableStock<ProductCardWithInventory>;

export type PublicProductCard = WithAvailableStock<PublicCardWithInventory>;

type CatalogueVariant = Omit<ProductWithInventory['variants'][number], 'inventoryLevels'> & {
  availableStock: number;
};

export type CatalogueProduct = Omit<ProductWithInventory, 'variants'> & {
  variants: CatalogueVariant[];
};

export interface PaginatedProducts {
  items: PublicProductCard[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedAdminProducts {
  items: CatalogueProductCard[];
  total: number;
  page: number;
  limit: number;
}

export type CatalogueProductImage = ProductImage & { variantLinks: { variantId: string }[] };

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

interface StoredDerivative extends ImageDerivative {
  path: string;
  url: string;
}

interface StoredProductImage {
  sourceWidth: number;
  sourceHeight: number;
  derivatives: StoredDerivative[];
}

export const PUBLIC_CATALOGUE_CACHE_VERSION_KEY = 'catalogue:version';
// Entries are fresh for 30s. After that the stale copy is served while one
// background load refreshes it, so shoppers never wait on the database once warm.
// Catalogue edits and admin stock adjustments bump the version key, which skips stale copies.
const PUBLIC_CATALOGUE_CACHE_FRESH_MS = 30_000;
const PUBLIC_CATALOGUE_CACHE_TTL_SECONDS = 15 * 60;
// Each cache hit would otherwise read the version key before the entry; remembering it this
// long saves that Redis round trip while edits still show on every instance within a second.
const PUBLIC_CATALOGUE_VERSION_MEMO_MS = 1_000;

interface PublicCacheEntry<T> {
  value: T;
  freshUntil: number;
}
const CATEGORY_AUDIT_FIELDS = [
  'name',
  'slug',
  'description',
  'isPublished',
  'sortOrder',
  'parentId',
] as const;
const PRODUCT_AUDIT_FIELDS = ['name', 'category', 'status', 'description', 'material'] as const;
const VARIANT_AUDIT_FIELDS = [
  'sku',
  'alias',
  'color',
  'colorHex',
  'size',
  'packQuantity',
  'pricePaise',
  'compareAtPricePaise',
  'isActive',
] as const;
const IMAGE_AUDIT_FIELDS = ['altText', 'variantIds', 'sortOrder', 'sourceFilename'] as const;
const VIDEO_AUDIT_FIELDS = ['altText', 'sortOrder', 'sourceFilename'] as const;

@Injectable()
export class CatalogueService {
  private readonly logger = new Logger(CatalogueService.name);
  private readonly publicLoads = new Map<string, Promise<unknown>>();
  private cacheVersion: { value: string; until: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly videoProcessor: VideoProcessorService = new VideoProcessorService(),
    private readonly redis?: RedisService,
  ) {}

  listPublicCategories(): Promise<Category[]> {
    return this.cachedPublic('categories', () =>
      this.prisma.category.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async listPublicProducts(query: ListProductsDto): Promise<PaginatedProducts> {
    const cacheKey = [
      'products',
      query.page,
      query.limit,
      query.category ?? '',
      query.q?.trim().toLowerCase() ?? '',
      [...new Set(query.ids ?? [])].sort().join(','),
    ].join(':');
    return this.cachedPublic(cacheKey, () => this.loadPublicProducts(query));
  }

  private async loadPublicProducts(query: ListProductsDto): Promise<PaginatedProducts> {
    const skip = (query.page - 1) * query.limit;
    const inStock = (product: PublicCardWithInventory): boolean =>
      product.variants.some((variant) =>
        variant.inventoryLevels.some((level) => level.onHand - level.reserved > 0),
      );
    if (query.ids?.length) {
      // An id list (a wishlist) is at most 100 products, so load the cards in one round
      // trip and rank them here.
      const cards = await this.prisma.product.findMany({
        relationLoadStrategy: 'join',
        where: {
          id: { in: query.ids },
          status: ProductStatus.PUBLISHED,
          publishedAt: { lte: new Date() },
          category: {
            isPublished: true,
            ...(query.category ? { slug: query.category } : {}),
          },
          ...(query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { shortDescription: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: publicCardSelect,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      });
      return {
        items: [...cards.filter(inStock), ...cards.filter((product) => !inStock(product))]
          .slice(skip, skip + query.limit)
          .map((product) => this.productCard(product)),
        total: cards.length,
        page: query.page,
        limit: query.limit,
      };
    }

    // Rank in SQL (in-stock products first, then newest) and fetch just the requested page of
    // ids with the total, instead of loading every matching product to sort it here.
    const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : null;
    const filters = Prisma.sql`
      product.status = 'published'
      and product.published_at <= now()
      and category.is_published
      ${query.category ? Prisma.sql`and category.slug = ${query.category}` : Prisma.empty}
      ${
        pattern
          ? Prisma.sql`and (product.name ilike ${pattern} or product.short_description ilike ${pattern})`
          : Prisma.empty
      }`;
    const ranked = await this.prisma.$queryRaw<{ id: string; total: number }[]>`
      select product.id, (count(*) over ())::integer as total
      from public.products as product
      join public.categories as category on category.id = product.category_id
      where ${filters}
      order by
        exists (
          select 1
          from public.product_variants as variant
          join public.inventory_levels as level on level.variant_id = variant.id
          join public.warehouses as warehouse on warehouse.id = level.warehouse_id
          where variant.product_id = product.id
            and variant.is_active
            and warehouse.is_active
            and level.on_hand - level.reserved > 0
        ) desc,
        product.published_at desc,
        product.created_at desc,
        product.id
      limit ${query.limit}
      offset ${skip}
    `;
    const total =
      ranked[0]?.total ??
      (skip > 0
        ? // Past the last page the window count has no row to ride on.
          (
            await this.prisma.$queryRaw<{ total: number }[]>`
              select count(*)::integer as total
              from public.products as product
              join public.categories as category on category.id = product.category_id
              where ${filters}
            `
          )[0].total
        : 0);
    const pageIds = ranked.map((row) => row.id);
    const items = pageIds.length
      ? await this.prisma.product.findMany({
          relationLoadStrategy: 'join',
          where: { id: { in: pageIds } },
          select: publicCardSelect,
        })
      : [];
    const position = new Map(pageIds.map((id, index) => [id, index]));
    items.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    return {
      items: items.map((product) => this.productCard(product)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getPublicProduct(slug: string): Promise<CatalogueProduct> {
    return this.cachedPublic(`product:${slug.toLowerCase()}`, () => this.loadPublicProduct(slug));
  }

  private async loadPublicProduct(slug: string): Promise<CatalogueProduct> {
    const product = await this.prisma.product.findFirst({
      relationLoadStrategy: 'join',
      where: {
        slug,
        status: ProductStatus.PUBLISHED,
        publishedAt: { lte: new Date() },
        category: { isPublished: true },
      },
      include: {
        ...productInclude,
        variants: {
          ...productInclude.variants,
          where: { isActive: true },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.withAvailableStock(product);
  }

  listAdminCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** Every product, newest first: catalogue export and import matching read the whole list. */
  async listAdminProducts(): Promise<CatalogueProductCard[]> {
    const products = await this.prisma.product.findMany({
      relationLoadStrategy: 'join',
      include: productCardInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return products.map((product) => this.productCard(product));
  }

  /** One page of the admin product table, newest first, with the number of matches. */
  async listAdminProductPage(query: ListAdminProductsDto): Promise<PaginatedAdminProducts> {
    const skip = (query.page - 1) * query.limit;
    // ILIKE treats % and _ as wildcards, so a search for "50%" must match the literal text.
    const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : null;
    const filters = Prisma.sql`
      true
      ${query.status ? Prisma.sql`and product.status = ${query.status.toLowerCase()}::public.product_status` : Prisma.empty}
      ${query.category ? Prisma.sql`and product.category_id = ${query.category}::uuid` : Prisma.empty}
      ${
        pattern
          ? Prisma.sql`and (
              product.name ilike ${pattern}
              or product.slug ilike ${pattern}
              or exists (
                select 1
                from public.product_variants as variant
                where variant.product_id = product.id
                  and (variant.sku ilike ${pattern} or variant.alias ilike ${pattern})
              )
            )`
          : Prisma.empty
      }`;
    const ranked = await this.prisma.$queryRaw<{ id: string; total: number }[]>`
      select product.id, (count(*) over ())::integer as total
      from public.products as product
      where ${filters}
      order by product.created_at desc, product.id desc
      limit ${query.limit}
      offset ${skip}
    `;
    const total =
      ranked[0]?.total ??
      (skip > 0
        ? // Past the last page the window count has no row to ride on.
          (
            await this.prisma.$queryRaw<{ total: number }[]>`
              select count(*)::integer as total
              from public.products as product
              where ${filters}
            `
          )[0].total
        : 0);
    const pageIds = ranked.map((row) => row.id);
    const products = pageIds.length
      ? await this.prisma.product.findMany({
          relationLoadStrategy: 'join',
          where: { id: { in: pageIds } },
          include: productCardInclude,
        })
      : [];
    const position = new Map(pageIds.map((id, index) => [id, index]));
    products.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    return {
      items: products.map((product) => this.productCard(product)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getAdminProduct(productId: string): Promise<CatalogueProduct> {
    const product = await this.prisma.product.findUnique({
      relationLoadStrategy: 'join',
      where: { id: productId },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.withAvailableStock(product);
  }

  async createCategory(
    actorId: string,
    input: CreateCategoryDto,
    context: RequestContext,
  ): Promise<Category> {
    const name = this.normalizedCategoryName(input.name);
    this.assertPublishableCategory(name, input.isPublished);
    const category = await this.mutate(
      () =>
        this.prisma.category.create({
          data: {
            ...input,
            name,
            slug: this.categorySlug(name),
          },
        }),
      'Category',
      'A category with this name already exists',
    );
    await this.auditMutation(
      actorId,
      'catalogue.category.created',
      'category',
      category.id,
      context,
      auditChangeMetadata(category.name, {}, category, CATEGORY_AUDIT_FIELDS),
    );
    return category;
  }

  async updateCategory(
    actorId: string,
    categoryId: string,
    input: UpdateCategoryDto,
    context: RequestContext,
  ): Promise<Category> {
    if (input.parentId === categoryId) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    const existing = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!existing) throw new NotFoundException('Category not found');
    let name = input.name ? this.normalizedCategoryName(input.name) : undefined;
    if (input.isPublished && !name) {
      name = existing.name;
    }
    this.assertPublishableCategory(name, input.isPublished);
    // The slug is part of storefront URLs, so renaming a category keeps it unchanged.
    const category = await this.mutate(
      () =>
        this.prisma.category.update({
          where: { id: categoryId },
          data: { ...input, name },
        }),
      'Category',
    );
    await this.auditMutation(
      actorId,
      'catalogue.category.updated',
      'category',
      category.id,
      context,
      auditChangeMetadata(category.name, existing, category, CATEGORY_AUDIT_FIELDS),
    );
    return category;
  }

  async deleteCategory(
    actorId: string,
    categoryId: string,
    context: RequestContext,
  ): Promise<void> {
    const category = await this.mutate(
      () => this.prisma.category.delete({ where: { id: categoryId } }),
      'Category',
    );
    await this.auditMutation(
      actorId,
      'catalogue.category.deleted',
      'category',
      categoryId,
      context,
      auditChangeMetadata(category.name, category, {}, CATEGORY_AUDIT_FIELDS),
    );
  }

  async createProduct(
    actorId: string,
    input: CreateProductDto,
    context: RequestContext,
  ): Promise<CatalogueProduct> {
    const product = await this.mutate(
      async () => {
        // Two products can share a name (or a name with no Latin letters can slugify to the
        // same fallback), so a taken URL gets the next free numeric suffix instead of a 409.
        for (let attempt = 1; ; attempt += 1) {
          const slug = await this.availableProductSlug(input.slug.toLowerCase());
          try {
            return await this.prisma.product.create({
              data: this.productData({ ...input, slug }),
              include: productInclude,
            });
          } catch (error) {
            // Another save took the same URL between the check and the insert.
            if (attempt >= 3 || !this.uniqueTargetIncludes(error, 'slug')) throw error;
          }
        }
      },
      'Product',
      'A product with this URL already exists',
    );
    await this.auditMutation(
      actorId,
      'catalogue.product.created',
      'product',
      product.id,
      context,
      auditChangeMetadata(
        product.name,
        {},
        this.productAuditSnapshot(product),
        PRODUCT_AUDIT_FIELDS,
      ),
    );
    return this.withAvailableStock(product);
  }

  async updateProduct(
    actorId: string,
    productId: string,
    input: UpdateProductDto,
    context: RequestContext,
  ): Promise<CatalogueProduct> {
    const previous = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });
    if (!previous) throw new NotFoundException('Product not found');
    const product = await this.mutate(
      () =>
        this.prisma.product.update({
          where: { id: productId },
          data: this.productData(input, previous),
          include: productInclude,
        }),
      'Product',
      'A product with this URL already exists',
    );
    await this.auditMutation(
      actorId,
      'catalogue.product.updated',
      'product',
      product.id,
      context,
      auditChangeMetadata(
        product.name,
        this.productAuditSnapshot(previous),
        this.productAuditSnapshot(product),
        PRODUCT_AUDIT_FIELDS,
      ),
    );
    return this.withAvailableStock(product);
  }

  async deleteProduct(actorId: string, productId: string, context: RequestContext): Promise<void> {
    const [images, videos] = await Promise.all([
      this.prisma.productImage.findMany({ where: { productId } }),
      this.prisma.productVideo.findMany({ where: { productId } }),
    ]);
    const deletedProduct = await this.prisma.$transaction(async (transaction) => {
      const product = await transaction.product.findUnique({
        where: { id: productId },
        select: {
          name: true,
          categoryId: true,
          status: true,
          description: true,
          material: true,
          category: { select: { name: true } },
          variants: { select: { id: true } },
        },
      });
      if (!product) throw new NotFoundException('Product not found');
      const variantIds = product.variants.map((variant) => variant.id);
      await this.requireUnusedVariants(transaction, variantIds);
      await transaction.inventoryLevel.deleteMany({ where: { variantId: { in: variantIds } } });
      await transaction.product.delete({ where: { id: productId } });
      return product;
    });
    await this.removeStoredImages(images);
    await this.removeStoredVideos(videos);
    await this.auditMutation(
      actorId,
      'catalogue.product.deleted',
      'product',
      productId,
      context,
      auditChangeMetadata(
        deletedProduct.name,
        this.productAuditSnapshot(deletedProduct),
        {},
        PRODUCT_AUDIT_FIELDS,
      ),
    );
  }

  async createVariant(
    actorId: string,
    productId: string,
    input: CreateVariantDto,
    context: RequestContext,
  ): Promise<ProductVariant> {
    this.validateVariantPrices(input.pricePaise, input.compareAtPricePaise);
    const variant = await this.mutate(() =>
      this.prisma.$transaction(async (transaction) => {
        const { color, colorHex, size, packQuantity, attributes, barcode, ...variantInput } = input;
        const alias = input.alias === undefined ? barcode : input.alias;
        const normalizedAlias = alias?.trim() || null;
        const created = await transaction.productVariant.create({
          data: {
            ...variantInput,
            sku: input.sku.toUpperCase(),
            alias:
              input.alias === undefined
                ? (normalizedAlias?.toUpperCase() ?? null)
                : normalizedAlias,
            attributes: this.variantAttributes(attributes, color, colorHex, size, packQuantity),
            productId,
          },
        });
        const warehouses = await transaction.warehouse.findMany({ select: { id: true } });
        if (warehouses.length > 0) {
          await transaction.inventoryLevel.createMany({
            data: warehouses.map((warehouse) => ({
              warehouseId: warehouse.id,
              variantId: created.id,
            })),
          });
        }
        return created;
      }),
    );
    await this.auditMutation(
      actorId,
      'catalogue.variant.created',
      'product_variant',
      variant.id,
      context,
      auditChangeMetadata(
        this.variantAuditLabel(variant),
        {},
        this.variantAuditSnapshot(variant),
        VARIANT_AUDIT_FIELDS,
      ),
    );
    return variant;
  }

  async updateVariant(
    actorId: string,
    variantId: string,
    input: UpdateVariantDto,
    context: RequestContext,
  ): Promise<ProductVariant> {
    const existing = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!existing) {
      throw new NotFoundException('Product variant not found');
    }
    this.validateVariantPrices(
      input.pricePaise ?? existing.pricePaise,
      input.compareAtPricePaise === undefined
        ? existing.compareAtPricePaise
        : input.compareAtPricePaise,
    );
    const variant = await this.mutate(() => {
      const { color, colorHex, size, packQuantity, attributes, barcode, ...variantInput } = input;
      const alias = input.alias === undefined ? barcode : input.alias;
      const normalizedAlias = alias?.trim() || null;
      return this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          ...variantInput,
          sku: input.sku?.toUpperCase(),
          alias:
            alias === undefined
              ? undefined
              : input.alias === undefined
                ? (normalizedAlias?.toUpperCase() ?? null)
                : normalizedAlias,
          attributes: this.variantAttributes(
            attributes,
            color,
            colorHex,
            size,
            packQuantity,
            existing.attributes,
          ),
        },
      });
    });
    await this.auditMutation(
      actorId,
      'catalogue.variant.updated',
      'product_variant',
      variant.id,
      context,
      auditChangeMetadata(
        this.variantAuditLabel(variant),
        this.variantAuditSnapshot(existing),
        this.variantAuditSnapshot(variant),
        VARIANT_AUDIT_FIELDS,
      ),
    );
    return variant;
  }

  async deleteVariant(actorId: string, variantId: string, context: RequestContext): Promise<void> {
    const variant = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.productVariant.findUnique({ where: { id: variantId } });
      if (!existing) throw new NotFoundException('Product variant not found');
      await this.requireUnusedVariants(transaction, [variantId]);
      await transaction.inventoryLevel.deleteMany({ where: { variantId } });
      await transaction.productVariant.delete({ where: { id: variantId } });
      return existing;
    });
    await this.auditMutation(
      actorId,
      'catalogue.variant.deleted',
      'product_variant',
      variantId,
      context,
      auditChangeMetadata(
        this.variantAuditLabel(variant),
        this.variantAuditSnapshot(variant),
        {},
        VARIANT_AUDIT_FIELDS,
      ),
    );
  }

  private async requireUnusedVariants(
    transaction: Prisma.TransactionClient,
    variantIds: string[],
  ): Promise<void> {
    if (!variantIds.length) return;
    const [stock, cartItems, reservations, movements] = await Promise.all([
      transaction.inventoryLevel.findFirst({
        where: {
          variantId: { in: variantIds },
          OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }],
        },
        select: { id: true },
      }),
      transaction.cartItem.count({ where: { variantId: { in: variantIds } } }),
      transaction.inventoryReservation.count({ where: { variantId: { in: variantIds } } }),
      transaction.stockMovement.count({ where: { variantId: { in: variantIds } } }),
    ]);
    if (stock || cartItems || reservations || movements) {
      throw new ConflictException(
        'Product variant has stock or order history and must be archived instead',
      );
    }
  }

  async addProductImage(
    actorId: string,
    productId: string,
    file: Express.Multer.File,
    metadata: ProductImageMetadataDto,
    context: RequestContext,
  ): Promise<ProductImage> {
    await this.requireProduct(productId);
    const variantIds = this.imageVariantIds(metadata);
    await this.requireVariantsForProduct(productId, variantIds);
    const image = await this.processAndStoreImage(productId, file);
    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.productImage.create({
          data: this.imageData(productId, file, metadata, image),
        });
        await this.createImageVariantLinks(transaction, created.id, variantIds);
        return transaction.productImage.findUniqueOrThrow({
          where: { id: created.id },
          include: { variantLinks: { select: { variantId: true } } },
        });
      });
      await this.auditMutation(
        actorId,
        'catalogue.image.created',
        'product_image',
        record.id,
        context,
        auditChangeMetadata(
          record.altText,
          {},
          this.imageAuditSnapshot(record),
          IMAGE_AUDIT_FIELDS,
        ),
      );
      return record;
    } catch (error) {
      await this.tryRemove(image.derivatives.map(({ path }) => path));
      throw error;
    }
  }

  /** The image this product already holds from a Google Drive file, oldest first. */
  async findGoogleDriveImage(productId: string, fileId: string): Promise<ProductImage | null> {
    const prefixes = googleDriveSourcePrefixes(fileId);
    const candidates = await this.prisma.productImage.findMany({
      where: {
        productId,
        OR: prefixes.map((prefix) => ({ sourceFilename: { startsWith: prefix } })),
      },
      include: { variantLinks: { select: { variantId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    // Prisma passes `_` (valid in Drive ids) to LIKE unescaped, so confirm the exact prefix.
    return (
      candidates.find((image) =>
        prefixes.some((prefix) => image.sourceFilename.startsWith(prefix)),
      ) ?? null
    );
  }

  async replaceProductImage(
    actorId: string,
    productId: string,
    imageId: string,
    file: Express.Multer.File,
    metadata: ProductImageMetadataDto,
    context: RequestContext,
  ): Promise<ProductImage> {
    const previous = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!previous) {
      throw new NotFoundException('Product image not found');
    }
    const requestedVariantIds = this.imageVariantIds(metadata);
    const previousWithLinks = await this.prisma.productImage.findUnique({
      where: { id: previous.id },
      include: { variantLinks: { select: { variantId: true } } },
    });
    const variantIds =
      metadata.variantIds !== undefined || metadata.variantId !== undefined
        ? requestedVariantIds
        : (previousWithLinks?.variantLinks.map((link) => link.variantId) ?? []);
    await this.requireVariantsForProduct(productId, variantIds);

    const image = await this.processAndStoreImage(productId, file);
    let replacement: ProductImage;
    try {
      replacement = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.productImage.create({
          data: this.imageData(productId, file, metadata, image),
        });
        await this.createImageVariantLinks(transaction, created.id, variantIds);
        await transaction.productImage.delete({ where: { id: previous.id } });
        return transaction.productImage.findUniqueOrThrow({
          where: { id: created.id },
          include: { variantLinks: { select: { variantId: true } } },
        });
      });
    } catch (error) {
      await this.tryRemove(image.derivatives.map(({ path }) => path));
      throw error;
    }

    await this.removeImages(this.imagePaths(previous));
    await this.auditMutation(
      actorId,
      'catalogue.image.replaced',
      'product_image',
      replacement.id,
      context,
      {
        ...auditChangeMetadata(
          replacement.altText,
          this.imageAuditSnapshot(previousWithLinks ?? previous),
          this.imageAuditSnapshot(replacement),
          IMAGE_AUDIT_FIELDS,
        ),
        replacedImageId: previous.id,
      },
    );
    return replacement;
  }

  async updateProductImage(
    actorId: string,
    productId: string,
    imageId: string,
    input: UpdateProductImageDto,
    context: RequestContext,
  ): Promise<ProductImage> {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
      include: { variantLinks: { select: { variantId: true } } },
    });
    if (!image) {
      throw new NotFoundException('Product image not found');
    }
    const hasVariantUpdate = input.variantIds !== undefined || input.variantId !== undefined;
    const variantIds =
      input.variantIds ??
      (input.variantId === undefined
        ? image.variantLinks.map((link) => link.variantId)
        : input.variantId === null
          ? []
          : [input.variantId]);
    await this.requireVariantsForProduct(productId, variantIds);
    const imageInput = {
      ...(input.altText !== undefined ? { altText: input.altText } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    };
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.productImage.update({
        where: { id: imageId },
        data: imageInput,
      });
      if (hasVariantUpdate) {
        await transaction.productImageVariant.deleteMany({ where: { imageId } });
        await this.createImageVariantLinks(transaction, imageId, variantIds);
      }
      return transaction.productImage.findUniqueOrThrow({
        where: { id: imageId },
        include: { variantLinks: { select: { variantId: true } } },
      });
    });
    await this.auditMutation(
      actorId,
      'catalogue.image.updated',
      'product_image',
      imageId,
      context,
      auditChangeMetadata(
        updated.altText,
        this.imageAuditSnapshot(image),
        this.imageAuditSnapshot(updated),
        IMAGE_AUDIT_FIELDS,
      ),
    );
    return updated;
  }

  /**
   * Puts every image of a product in the given order (sortOrder 0..n-1) in one transaction.
   * The list must name each of the product's images exactly once, so an editor working from
   * a stale gallery (an image added or deleted elsewhere) is refused instead of half-applied.
   */
  async reorderProductImages(
    actorId: string,
    productId: string,
    imageIds: string[],
    context: RequestContext,
  ): Promise<CatalogueProductImage[]> {
    const product = await this.requireProduct(productId);
    const imageSelect = {
      orderBy: productInclude.images.orderBy,
      include: productInclude.images.include,
    };
    const { before, after, changed } = await this.prisma.$transaction(async (transaction) => {
      // Serializes reorders (and keeps the image set stable) for this product until commit.
      await transaction.$queryRaw`
        select id from public.product_images where product_id = ${productId}::uuid for update
      `;
      const current = await transaction.productImage.findMany({
        where: { productId },
        ...imageSelect,
      });
      const currentIds = new Set(current.map((image) => image.id));
      if (
        imageIds.length !== currentIds.size ||
        new Set(imageIds).size !== imageIds.length ||
        imageIds.some((id) => !currentIds.has(id))
      ) {
        throw new BadRequestException(
          'The image order must list every image of this product exactly once. Reload the product and try again.',
        );
      }
      const changed = await transaction.$executeRaw`
        update public.product_images as image
        set sort_order = ordered.position - 1
        from unnest(${imageIds}::uuid[]) with ordinality as ordered(id, position)
        where image.id = ordered.id
          and image.product_id = ${productId}::uuid
          and image.sort_order <> ordered.position - 1
      `;
      return {
        before: current,
        after: changed
          ? await transaction.productImage.findMany({ where: { productId }, ...imageSelect })
          : current,
        changed,
      };
    });
    // Saving the order it already has changes nothing, so there is nothing to audit or expire.
    if (!changed) return after;
    const order = (images: CatalogueProductImage[]): string[] =>
      images.map((image) => image.sourceFilename || image.altText);
    await this.auditMutation(
      actorId,
      'catalogue.product.images_reordered',
      'product',
      productId,
      context,
      auditChangeMetadata(
        product.name,
        { imageOrder: order(before) },
        { imageOrder: order(after) },
        ['imageOrder'],
      ),
    );
    return after;
  }

  async deleteProductImage(
    actorId: string,
    productId: string,
    imageId: string,
    context: RequestContext,
  ): Promise<void> {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) {
      throw new NotFoundException('Product image not found');
    }
    await this.prisma.productImage.delete({ where: { id: image.id } });
    await this.removeImages(this.imagePaths(image));
    await this.auditMutation(
      actorId,
      'catalogue.image.deleted',
      'product_image',
      imageId,
      context,
      auditChangeMetadata(image.altText, image, {}, IMAGE_AUDIT_FIELDS),
    );
  }

  async uploadProductVideo(
    actorId: string,
    productId: string,
    file: Express.Multer.File,
    metadata: ImageMetadataDto,
    context: RequestContext,
  ): Promise<ProductVideo> {
    await this.requireProduct(productId);
    const videoId = randomUUID();
    const processed = await this.videoProcessor.process(file);
    const storagePath = `${productId}/${videoId}/source.mp4`;
    try {
      await this.supabase.uploadProductVideo(storagePath, processed.buffer, processed.mimetype);
    } catch {
      throw new BadGatewayException('Product video storage failed');
    }

    try {
      const video = await this.prisma.productVideo.create({
        data: {
          productId,
          url: this.supabase.getProductVideoPublicUrl(storagePath),
          storagePath,
          sourceFilename: basename(file.originalname).slice(0, 255) || 'upload',
          sourceMimeType: processed.mimetype,
          altText: metadata.altText,
          sortOrder: metadata.sortOrder ?? 0,
        },
      });
      await this.auditMutation(
        actorId,
        'catalogue.video.created',
        'product_video',
        video.id,
        context,
        {
          ...auditChangeMetadata(video.altText, {}, video, VIDEO_AUDIT_FIELDS),
          source: 'upload',
        },
      );
      return video;
    } catch (error) {
      await this.tryRemoveVideos([storagePath]);
      throw error;
    }
  }

  async deleteProductVideo(
    actorId: string,
    productId: string,
    videoId: string,
    context: RequestContext,
  ): Promise<void> {
    const video = await this.prisma.productVideo.findFirst({
      where: { id: videoId, productId },
    });
    if (!video) {
      throw new NotFoundException('Product video not found');
    }
    await this.prisma.productVideo.delete({ where: { id: video.id } });
    if (video.storagePath) {
      await this.removeStoredVideos([video]);
    }
    await this.auditMutation(
      actorId,
      'catalogue.video.deleted',
      'product_video',
      videoId,
      context,
      auditChangeMetadata(video.altText, video, {}, VIDEO_AUDIT_FIELDS),
    );
  }

  private productAuditSnapshot(product: {
    name: string;
    categoryId: string;
    category?: { name: string } | null;
    status: ProductStatus;
    description: string | null;
    material: string | null;
  }): Record<string, string | null> {
    return {
      name: product.name,
      category: product.category?.name ?? product.categoryId,
      status: product.status,
      description: product.description,
      material: product.material,
    };
  }

  private variantAuditSnapshot(variant: {
    sku: string;
    alias: string | null;
    pricePaise: number;
    compareAtPricePaise: number | null;
    isActive: boolean;
    attributes: Prisma.JsonValue;
  }): Record<string, string | number | boolean | null> {
    const attributes =
      variant.attributes &&
      typeof variant.attributes === 'object' &&
      !Array.isArray(variant.attributes)
        ? (variant.attributes as Record<string, Prisma.JsonValue>)
        : {};
    return {
      sku: variant.sku,
      alias: variant.alias,
      color: typeof attributes.color === 'string' ? attributes.color : null,
      colorHex: typeof attributes.colorHex === 'string' ? attributes.colorHex : null,
      size: typeof attributes.size === 'string' ? attributes.size : null,
      packQuantity: typeof attributes.packQuantity === 'number' ? attributes.packQuantity : null,
      pricePaise: variant.pricePaise,
      compareAtPricePaise: variant.compareAtPricePaise,
      isActive: variant.isActive,
    };
  }

  private variantAuditLabel(variant: { sku: string; attributes: Prisma.JsonValue }): string {
    const snapshot = this.variantAuditSnapshot({
      ...variant,
      alias: null,
      pricePaise: 0,
      compareAtPricePaise: null,
      isActive: true,
    });
    const options = [
      snapshot.color,
      snapshot.size,
      typeof snapshot.packQuantity === 'number' ? `Pack of ${snapshot.packQuantity}` : null,
    ].filter((value): value is string => typeof value === 'string' && Boolean(value));
    return options.length ? `${options.join(' · ')} · ${variant.sku}` : variant.sku;
  }

  /**
   * Optional DTO fields also let null through (IsOptional skips null), e.g. an import
   * rollback restoring a product without a material: nullable columns are cleared and
   * required columns ignore null instead of failing in the database.
   */
  private productData(
    input: CreateProductDto | UpdateProductDto,
    previous?: { status: ProductStatus; publishedAt: Date | null },
  ): Prisma.ProductUncheckedCreateInput {
    const nullable = <T>(value: T | null | undefined): T | null | undefined =>
      value === undefined ? undefined : value;
    return {
      categoryId: (input.categoryId ?? undefined) as string,
      name: (input.name ?? undefined) as string,
      slug: input.slug?.toLowerCase() as string,
      shortDescription: nullable(input.shortDescription),
      description: nullable(input.description),
      material: input.material == null ? nullable(input.material) : input.material.trim() || null,
      status: input.status ?? undefined,
      attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
      seoTitle: nullable(input.seoTitle),
      seoDescription: nullable(input.seoDescription),
      publishedAt: this.publishedAt(input.status, previous),
    };
  }

  /** Only a move into PUBLISHED stamps the publish date; re-saving keeps the original. */
  private publishedAt(
    status: ProductStatus | null | undefined,
    previous?: { status: ProductStatus; publishedAt: Date | null },
  ): Date | null | undefined {
    if (!status) return undefined;
    if (status !== ProductStatus.PUBLISHED) return null;
    if (previous?.status === ProductStatus.PUBLISHED && previous.publishedAt) return undefined;
    return new Date();
  }

  private async availableProductSlug(base: string): Promise<string> {
    const taken = new Set(
      (
        await this.prisma.product.findMany({
          where: { slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((product) => product.slug),
    );
    if (!taken.has(base)) return base;
    let suffix = 2;
    while (taken.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  private validateVariantPrices(pricePaise: number, compareAtPricePaise?: number | null): void {
    if (compareAtPricePaise != null && compareAtPricePaise < pricePaise) {
      throw new BadRequestException('compareAtPricePaise cannot be lower than pricePaise');
    }
  }

  private normalizedCategoryName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }

  private categorySlug(name: string): string {
    return (
      name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'category'
    );
  }

  private assertPublishableCategory(name?: string, isPublished?: boolean): void {
    if (isPublished && name && /^(test(?:ing)?|demo|sample|untitled)$/i.test(name)) {
      throw new BadRequestException('Placeholder categories cannot be published');
    }
  }

  private async requireProduct(productId: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private async requireVariantsForProduct(productId: string, variantIds: string[]): Promise<void> {
    if (variantIds.length === 0) return;
    const variants = await this.prisma.productVariant.count({
      where: { id: { in: variantIds }, productId },
    });
    if (variants !== variantIds.length) {
      throw new BadRequestException('An image variant does not belong to this product');
    }
  }

  private async processAndStoreImage(
    productId: string,
    file: Express.Multer.File,
  ): Promise<StoredProductImage> {
    const processed = await this.imageProcessor.process(file);
    const imageId = randomUUID();
    const stored: StoredDerivative[] = [];

    try {
      for (const derivative of processed.derivatives) {
        const path = `${productId}/${imageId}/${derivative.name}.webp`;
        await this.supabase.uploadProductImage(path, derivative.buffer);
        stored.push({
          ...derivative,
          path,
          url: this.supabase.getProductImagePublicUrl(path),
        });
      }
      return {
        sourceWidth: processed.sourceWidth,
        sourceHeight: processed.sourceHeight,
        derivatives: stored,
      };
    } catch {
      await this.tryRemove(stored.map(({ path }) => path));
      throw new BadGatewayException('Product image storage failed');
    }
  }

  private imageData(
    productId: string,
    file: Express.Multer.File,
    metadata: ProductImageMetadataDto,
    image: StoredProductImage,
  ): Prisma.ProductImageUncheckedCreateInput {
    const derivatives = image.derivatives;
    const thumbnail = this.derivative(derivatives, 'thumbnail');
    const medium = this.derivative(derivatives, 'medium');
    const large = this.derivative(derivatives, 'large');
    return {
      productId,
      altText: metadata.altText,
      sortOrder: metadata.sortOrder ?? 0,
      sourceFilename: basename(file.originalname).slice(0, 255) || 'upload',
      sourceMimeType: file.mimetype,
      sourceWidth: image.sourceWidth,
      sourceHeight: image.sourceHeight,
      thumbnailPath: thumbnail.path,
      thumbnailUrl: thumbnail.url,
      thumbnailWidth: thumbnail.width,
      thumbnailHeight: thumbnail.height,
      thumbnailBytes: thumbnail.bytes,
      mediumPath: medium.path,
      mediumUrl: medium.url,
      mediumWidth: medium.width,
      mediumHeight: medium.height,
      mediumBytes: medium.bytes,
      largePath: large.path,
      largeUrl: large.url,
      largeWidth: large.width,
      largeHeight: large.height,
      largeBytes: large.bytes,
    };
  }

  private variantAttributes(
    input: Record<string, unknown> | undefined,
    color: string | null | undefined,
    colorHex: string | null | undefined,
    size: string | null | undefined,
    packQuantity: number | null | undefined,
    existing?: Prisma.JsonValue,
  ): Prisma.InputJsonValue {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
    const attributes = { ...base, ...(input ?? {}) } as Record<string, Prisma.JsonValue>;
    // null clears a dimension even when stale `attributes` from the client still carry it.
    if (color === null) {
      delete attributes.color;
      delete attributes.colorHex;
    } else if (color !== undefined) attributes.color = color.trim();
    if (colorHex === null) delete attributes.colorHex;
    else if (colorHex !== undefined) attributes.colorHex = colorHex.toUpperCase();
    if (size === null) delete attributes.size;
    else if (size !== undefined) attributes.size = size.trim();
    if (packQuantity === null) delete attributes.packQuantity;
    else if (packQuantity !== undefined) attributes.packQuantity = packQuantity;
    return attributes as Prisma.InputJsonValue;
  }

  private imageVariantIds(metadata: ProductImageMetadataDto): string[] {
    return [...new Set(metadata.variantIds ?? (metadata.variantId ? [metadata.variantId] : []))];
  }

  private async createImageVariantLinks(
    transaction: Prisma.TransactionClient,
    imageId: string,
    variantIds: string[],
  ): Promise<void> {
    if (variantIds.length === 0) return;
    await transaction.productImageVariant.createMany({
      data: variantIds.map((variantId) => ({ imageId, variantId })),
      skipDuplicates: true,
    });
  }

  private imageAuditSnapshot(image: {
    altText: string;
    sortOrder: number;
    sourceFilename: string;
    variantLinks?: Array<{ variantId: string }>;
  }): Record<string, string | number | string[]> {
    return {
      altText: image.altText,
      variantIds: image.variantLinks?.map((link) => link.variantId) ?? [],
      sortOrder: image.sortOrder,
      sourceFilename: image.sourceFilename,
    };
  }

  private derivative(
    derivatives: StoredDerivative[],
    name: ImageDerivative['name'],
  ): StoredDerivative {
    const derivative = derivatives.find((candidate) => candidate.name === name);
    if (!derivative) {
      throw new Error(`Missing ${name} derivative`);
    }
    return derivative;
  }

  private imagePaths(image: ProductImage): string[] {
    return [image.thumbnailPath, image.mediumPath, image.largePath];
  }

  private async removeStoredImages(images: ProductImage[]): Promise<void> {
    await this.removeImages(images.flatMap((image) => this.imagePaths(image)));
  }

  private async removeStoredVideos(videos: ProductVideo[]): Promise<void> {
    await this.tryRemoveVideos(
      videos.flatMap((video) => (video.storagePath ? [video.storagePath] : [])),
    );
  }

  private async removeImages(paths: string[]): Promise<void> {
    await this.tryRemove(paths);
  }

  // Storage cleanup always runs after the database change has committed (or when a record
  // was never created), so a failure can only leave an orphaned file, never a broken public
  // reference. It is logged for manual cleanup instead of failing a change that already happened.
  private async tryRemove(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    try {
      await this.supabase.removeProductImages(paths);
    } catch (error) {
      this.logger.warn(
        `Orphaned product image files left in storage: ${paths.join(', ')} (${this.errorMessage(error)})`,
      );
    }
  }

  private async tryRemoveVideos(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    try {
      await this.supabase.removeProductVideos(paths);
    } catch (error) {
      this.logger.warn(
        `Orphaned product video files left in storage: ${paths.join(', ')} (${this.errorMessage(error)})`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Keeps only the images a card can show: the first shared image (or the first
   * image when none is shared) and the first image of each variant. Order is kept,
   * so the frontend's primary-image choice is the same as with every image.
   */
  private productCard<T extends CardShape>(product: T): WithAvailableStock<T> {
    const { images } = product;
    const picked = new Set(
      [
        images.find((image) => image.variantLinks.length === 0) ?? images[0],
        ...product.variants.map((variant) =>
          images.find((image) => image.variantLinks.some((link) => link.variantId === variant.id)),
        ),
      ].filter((image) => image !== undefined),
    );
    return this.withAvailableStock({
      ...product,
      images: images.filter((image) => picked.has(image)),
    });
  }

  private withAvailableStock<T extends Pick<CardShape, 'variants'>>(
    product: T,
  ): WithAvailableStock<T> {
    // TypeScript cannot see that the rest of each variant is Omit<variant, 'inventoryLevels'>.
    return {
      ...product,
      variants: product.variants.map(({ inventoryLevels, ...variant }) => ({
        ...variant,
        // A checkout reservation is fulfilled from one warehouse, so show the
        // maximum stock that can actually be reserved from a single active location.
        availableStock: Math.max(
          0,
          ...inventoryLevels.map((level) => Math.max(0, level.onHand - level.reserved)),
        ),
      })),
    } as unknown as WithAvailableStock<T>;
  }

  private async auditMutation(
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    context: RequestContext,
    metadata: Prisma.InputJsonValue = {},
  ): Promise<void> {
    await this.invalidatePublicCache();
    await this.audit.record({
      actorId,
      action,
      entityType,
      entityId,
      metadata,
      ...context,
    });
  }

  private async cachedPublic<T>(suffix: string, load: () => Promise<T>): Promise<T> {
    if (!this.redis) return load();

    let key: string;
    let cached: PublicCacheEntry<T> | null;
    try {
      key = `catalogue:v2:${await this.publicCacheVersion(this.redis)}:${suffix}`;
      cached = await this.redis.getJson<PublicCacheEntry<T>>(key);
    } catch {
      return load();
    }

    if (cached) {
      if (cached.freshUntil <= Date.now()) {
        // Serve the stale copy now; a failed refresh keeps it until the TTL ends.
        this.refreshPublic(key, load).catch(() => undefined);
      }
      return cached.value;
    }
    return this.refreshPublic(key, load);
  }

  /** Loads once per key at a time, however many requests are waiting on it. */
  private refreshPublic<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.publicLoads.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const pending = load()
      .then(async (value) => {
        const entry: PublicCacheEntry<T> = {
          value,
          freshUntil: Date.now() + PUBLIC_CATALOGUE_CACHE_FRESH_MS,
        };
        try {
          await this.redis?.setJson(key, entry, PUBLIC_CATALOGUE_CACHE_TTL_SECONDS);
        } catch {
          // Redis is an optimization; public catalogue reads must still succeed without it.
        }
        return value;
      })
      .finally(() => {
        if (this.publicLoads.get(key) === pending) this.publicLoads.delete(key);
      });
    this.publicLoads.set(key, pending);
    return pending;
  }

  private async publicCacheVersion(redis: RedisService): Promise<string> {
    if (this.cacheVersion && this.cacheVersion.until > Date.now()) return this.cacheVersion.value;
    const value = (await redis.get(PUBLIC_CATALOGUE_CACHE_VERSION_KEY)) ?? '0';
    this.cacheVersion = { value, until: Date.now() + PUBLIC_CATALOGUE_VERSION_MEMO_MS };
    return value;
  }

  private async invalidatePublicCache(): Promise<void> {
    this.cacheVersion = null;
    try {
      await this.redis?.increment(PUBLIC_CATALOGUE_CACHE_VERSION_KEY);
    } catch {
      // The short TTL still bounds staleness if Redis is temporarily unavailable.
    }
  }

  private async mutate<T>(
    operation: () => Promise<T>,
    label = 'Record',
    conflictMessage = 'A record with that unique value already exists',
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          if (this.uniqueTargetIncludes(error, 'sku')) {
            throw new ConflictException('SKU must be unique across the catalogue');
          }
          throw new ConflictException(conflictMessage);
        }
        if (error.code === 'P2003') {
          throw new ConflictException(`${label} is still in use`);
        }
        if (error.code === 'P2025') {
          throw new NotFoundException(`${label} not found`);
        }
      }
      throw error;
    }
  }

  private uniqueTargetIncludes(error: unknown, field: string): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
    return fields.some((candidate) => candidate.toLowerCase().includes(field));
  }
}
