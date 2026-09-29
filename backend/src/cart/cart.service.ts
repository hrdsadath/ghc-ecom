import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CartStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { SetCartItemDto } from './dto/set-cart-item.dto';

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          imageLinks: {
            include: { image: true },
          },
          product: {
            include: {
              category: {
                select: { name: true },
              },
              images: {
                where: { variantLinks: { none: {} } },
                orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
                take: 1,
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export interface CartView {
  id: string;
  status: CartStatus;
  expiresAt: Date;
  items: Array<{
    id: string;
    variantId: string;
    sku: string;
    productName: string;
    color: string | null;
    size: string | null;
    packQuantity: number | null;
    optionLabel: string;
    imageUrl: string | null;
    quantity: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }>;
  subtotalPaise: number;
}

export interface CreatedCart {
  cart: CartView;
  guestToken?: string;
}

interface CartOwner {
  userId: string | null;
  guestTokenHash: string | null;
}

interface CartMutationResult {
  cartFound: boolean;
  variantFound: boolean;
  paymentPending: boolean;
  availableStock: number | null;
  itemChanged: boolean;
}

interface CartRemovalResult {
  cartFound: boolean;
  paymentPending: boolean;
  itemRemoved: boolean;
}

interface CartViewRow {
  cartId: string;
  status: CartStatus;
  expiresAt: Date;
  itemId: string | null;
  variantId: string | null;
  sku: string | null;
  productName: string | null;
  color: string | null;
  size: string | null;
  packQuantity: number | null;
  imageUrl: string | null;
  quantity: number | null;
  unitPricePaise: number | null;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async createCart(authorization?: string): Promise<CreatedCart> {
    const userId = await this.optionalUserId(authorization);
    if (userId) {
      const existing = await this.prisma.cart.findFirst({
        where: {
          userId,
          status: CartStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (existing) {
        return {
          cart: await this.getCartView(existing.id, { userId, guestTokenHash: null }),
        };
      }
      // An expired cart still counts against carts_one_active_per_user_idx until
      // it leaves the active status; its reservations expire on their own.
      await this.prisma.cart.updateMany({
        where: { userId, status: CartStatus.ACTIVE, expiresAt: { lte: new Date() } },
        data: { status: CartStatus.ABANDONED },
      });
      const cart = await this.prisma.cart.create({
        data: {
          userId,
          expiresAt: this.cartExpiry(),
        },
        select: { id: true, status: true, expiresAt: true },
      });
      return { cart: this.emptyCartView(cart) };
    }

    const guestToken = randomBytes(32).toString('base64url');
    const cart = await this.prisma.cart.create({
      data: {
        guestTokenHash: this.hashToken(guestToken),
        expiresAt: this.cartExpiry(),
      },
      select: { id: true, status: true, expiresAt: true },
    });
    return { cart: this.emptyCartView(cart), guestToken };
  }

  async getCart(cartId: string, authorization?: string, guestToken?: string): Promise<CartView> {
    const owner = await this.resolveOwner(authorization, guestToken);
    return this.getCartView(cartId, owner);
  }

  async setItem(
    cartId: string,
    input: SetCartItemDto,
    authorization?: string,
    guestToken?: string,
  ): Promise<CartView> {
    const owner = await this.resolveOwner(authorization, guestToken);
    const [result] = await this.prisma.$queryRaw<CartMutationResult[]>`
      with locked as materialized (
        select pg_advisory_xact_lock(hashtextextended(${cartId}::text, 0))
      ),
      owned_cart as materialized (
        select cart.id
        from public.carts as cart
        cross join locked
        where cart.id = ${cartId}::uuid
          and cart.status = 'active'
          and cart.expires_at > now()
          and (
            (${owner.userId}::uuid is not null and cart.user_id = ${owner.userId}::uuid)
            or (${owner.userId}::uuid is null and cart.guest_token_hash = ${owner.guestTokenHash})
          )
      ),
      pending_payment as materialized (
        select payment_order.id
        from public.orders as payment_order
        join owned_cart on owned_cart.id = payment_order.cart_id
        where payment_order.status = 'payment_pending'
          and payment_order.payment_expires_at > now()
        limit 1
      ),
      valid_variant as materialized (
        select variant.id
        from public.product_variants as variant
        join public.products as product on product.id = variant.product_id
        join public.categories as category on category.id = product.category_id
        where variant.id = ${input.variantId}::uuid
          and variant.is_active
          and product.status = 'published'
          and product.published_at <= now()
          and category.is_published
      ),
      released as materialized (
        select public.release_cart_reservations(owned_cart.id)
        from owned_cart
        cross join valid_variant
        where not exists (select 1 from pending_payment)
      ),
      variant_state as materialized (
        select
          valid_variant.id,
          coalesce(
            max(greatest(inventory.on_hand - inventory.reserved, 0))
              filter (where warehouse.is_active),
            0
          )::integer as available_stock
        from valid_variant
        cross join released
        left join public.inventory_levels as inventory on inventory.variant_id = valid_variant.id
        left join public.warehouses as warehouse on warehouse.id = inventory.warehouse_id
        group by valid_variant.id
      ),
      expired_quotes as (
        update public.checkout_quotes as quote
        set status = 'expired'
        from owned_cart, released
        where quote.cart_id = owned_cart.id
          and quote.status = 'active'
        returning quote.id
      ),
      quote_barrier as materialized (
        select count(*) from expired_quotes
      ),
      changed_item as (
        insert into public.cart_items (cart_id, variant_id, quantity)
        select owned_cart.id, variant_state.id, ${input.quantity}
        from owned_cart
        cross join variant_state
        cross join quote_barrier
        where ${input.quantity} <= variant_state.available_stock
        on conflict (cart_id, variant_id) do update
          set quantity = excluded.quantity,
              updated_at = now()
        returning id
      )
      select
        exists(select 1 from owned_cart) as "cartFound",
        exists(select 1 from valid_variant) as "variantFound",
        exists(select 1 from pending_payment) as "paymentPending",
        (select available_stock from variant_state limit 1) as "availableStock",
        exists(select 1 from changed_item) as "itemChanged"
    `;

    if (!result?.cartFound) throw new UnauthorizedException('Cart access denied');
    if (result.paymentPending) {
      throw new ConflictException(
        'Payment is already in progress for this bag. Complete or retry that payment before changing items.',
      );
    }
    if (!result.variantFound) throw new NotFoundException('Product variant not found');
    if (!result.itemChanged) {
      const availableStock = result.availableStock ?? 0;
      throw new ConflictException(
        availableStock === 0
          ? 'This product is currently out of stock.'
          : `Only ${availableStock} item${availableStock === 1 ? '' : 's'} are currently available.`,
      );
    }

    return this.getCartView(cartId, owner);
  }

  async removeItem(
    cartId: string,
    variantId: string,
    authorization?: string,
    guestToken?: string,
  ): Promise<CartView> {
    const owner = await this.resolveOwner(authorization, guestToken);
    const [result] = await this.prisma.$queryRaw<CartRemovalResult[]>`
      with locked as materialized (
        select pg_advisory_xact_lock(hashtextextended(${cartId}::text, 0))
      ),
      owned_cart as materialized (
        select cart.id
        from public.carts as cart
        cross join locked
        where cart.id = ${cartId}::uuid
          and cart.status = 'active'
          and cart.expires_at > now()
          and (
            (${owner.userId}::uuid is not null and cart.user_id = ${owner.userId}::uuid)
            or (${owner.userId}::uuid is null and cart.guest_token_hash = ${owner.guestTokenHash})
          )
      ),
      pending_payment as materialized (
        select payment_order.id
        from public.orders as payment_order
        join owned_cart on owned_cart.id = payment_order.cart_id
        where payment_order.status = 'payment_pending'
          and payment_order.payment_expires_at > now()
        limit 1
      ),
      released as materialized (
        select public.release_cart_reservations(owned_cart.id)
        from owned_cart
        where not exists (select 1 from pending_payment)
      ),
      expired_quotes as (
        update public.checkout_quotes as quote
        set status = 'expired'
        from owned_cart, released
        where quote.cart_id = owned_cart.id
          and quote.status = 'active'
        returning quote.id
      ),
      quote_barrier as materialized (
        select count(*) from expired_quotes
      ),
      removed_item as (
        delete from public.cart_items as item
        using owned_cart, released, quote_barrier
        where item.cart_id = owned_cart.id
          and item.variant_id = ${variantId}::uuid
        returning item.id
      )
      select
        exists(select 1 from owned_cart) as "cartFound",
        exists(select 1 from pending_payment) as "paymentPending",
        exists(select 1 from removed_item) as "itemRemoved"
    `;

    if (!result?.cartFound) throw new UnauthorizedException('Cart access denied');
    if (result.paymentPending) {
      throw new ConflictException(
        'Payment is already in progress for this bag. Complete or retry that payment before changing items.',
      );
    }
    if (!result.itemRemoved) throw new NotFoundException('Cart item not found');
    return this.getCartView(cartId, owner);
  }

  async requireAccessibleCart(
    cartId: string,
    authorization?: string,
    guestToken?: string,
  ): Promise<CartWithItems> {
    return this.requireOwnedCart(cartId, authorization, guestToken, true);
  }

  async requireOwnedCart(
    cartId: string,
    authorization?: string,
    guestToken?: string,
    requireActive = false,
  ): Promise<CartWithItems> {
    const userId = await this.optionalUserId(authorization);
    let ownerWhere: Prisma.CartWhereInput;
    if (userId) {
      ownerWhere = { userId };
    } else {
      if (!guestToken) throw new UnauthorizedException('Cart access denied');
      ownerWhere = { guestTokenHash: this.hashToken(guestToken) };
    }
    const cart = await this.prisma.cart.findFirst({
      relationLoadStrategy: 'join',
      where: {
        id: cartId,
        ...(requireActive ? { status: CartStatus.ACTIVE, expiresAt: { gt: new Date() } } : {}),
        ...ownerWhere,
      },
      include: cartInclude,
    });
    if (!cart) {
      throw new UnauthorizedException('Cart access denied');
    }
    return cart;
  }

  view(cart: CartWithItems): CartView {
    const items = cart.items.map((item) => {
      const options = this.variantOptions(item.variant.attributes);
      const image = [...item.variant.imageLinks].sort(
        (left, right) =>
          left.image.sortOrder - right.image.sortOrder ||
          left.image.createdAt.getTime() - right.image.createdAt.getTime(),
      )[0]?.image;
      return {
        id: item.id,
        variantId: item.variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        ...options,
        optionLabel: this.optionLabel(options),
        imageUrl: image?.thumbnailUrl ?? item.variant.product.images[0]?.thumbnailUrl ?? null,
        quantity: item.quantity,
        unitPricePaise: item.variant.pricePaise,
        lineTotalPaise: item.variant.pricePaise * item.quantity,
      };
    });
    return {
      id: cart.id,
      status: cart.status,
      expiresAt: cart.expiresAt,
      items,
      subtotalPaise: items.reduce((sum, item) => sum + item.lineTotalPaise, 0),
    };
  }

  private emptyCartView(cart: Pick<CartWithItems, 'id' | 'status' | 'expiresAt'>): CartView {
    return {
      id: cart.id,
      status: cart.status,
      expiresAt: cart.expiresAt,
      items: [],
      subtotalPaise: 0,
    };
  }

  private async getCartView(cartId: string, owner: CartOwner): Promise<CartView> {
    const rows = await this.prisma.$queryRaw<CartViewRow[]>`
      select
        cart.id as "cartId",
        upper(cart.status::text) as status,
        cart.expires_at as "expiresAt",
        item.id as "itemId",
        variant.id as "variantId",
        variant.sku,
        product.name as "productName",
        variant.attributes ->> 'color' as color,
        variant.attributes ->> 'size' as size,
        case
          when jsonb_typeof(variant.attributes -> 'packQuantity') = 'number'
          then (variant.attributes ->> 'packQuantity')::integer
          else null
        end as "packQuantity",
        coalesce(variant_image.thumbnail_url, product_image.thumbnail_url) as "imageUrl",
        item.quantity,
        variant.price_paise as "unitPricePaise"
      from public.carts as cart
      left join public.cart_items as item on item.cart_id = cart.id
      left join public.product_variants as variant on variant.id = item.variant_id
      left join public.products as product on product.id = variant.product_id
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
      where cart.id = ${cartId}::uuid
        and cart.status = 'active'
        and cart.expires_at > now()
        and (
          (${owner.userId}::uuid is not null and cart.user_id = ${owner.userId}::uuid)
          or (${owner.userId}::uuid is null and cart.guest_token_hash = ${owner.guestTokenHash})
        )
      order by item.created_at
    `;
    const cart = rows[0];
    if (!cart) throw new UnauthorizedException('Cart access denied');

    const items = rows.flatMap((row) => {
      if (
        !row.itemId ||
        !row.variantId ||
        !row.sku ||
        !row.productName ||
        row.quantity === null ||
        row.unitPricePaise === null
      ) {
        return [];
      }
      const options = {
        color: row.color,
        size: row.size,
        packQuantity: row.packQuantity,
      };
      return [
        {
          id: row.itemId,
          variantId: row.variantId,
          sku: row.sku,
          productName: row.productName,
          ...options,
          optionLabel: this.optionLabel(options),
          imageUrl: row.imageUrl,
          quantity: row.quantity,
          unitPricePaise: row.unitPricePaise,
          lineTotalPaise: row.unitPricePaise * row.quantity,
        },
      ];
    });
    return {
      id: cart.cartId,
      status: cart.status,
      expiresAt: cart.expiresAt,
      items,
      subtotalPaise: items.reduce((sum, item) => sum + item.lineTotalPaise, 0),
    };
  }

  private async resolveOwner(authorization?: string, guestToken?: string): Promise<CartOwner> {
    const userId = await this.optionalUserId(authorization);
    if (userId) return { userId, guestTokenHash: null };
    if (!guestToken) throw new UnauthorizedException('Cart access denied');
    return { userId: null, guestTokenHash: this.hashToken(guestToken) };
  }

  private async optionalUserId(authorization?: string): Promise<string | undefined> {
    if (!authorization) {
      return undefined;
    }
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match?.[1]) {
      throw new UnauthorizedException('Invalid authorization header');
    }
    return (await this.supabase.verifyAccessToken(match[1])).id;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private variantOptions(attributes: Prisma.JsonValue): {
    color: string | null;
    size: string | null;
    packQuantity: number | null;
  } {
    if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object') {
      return { color: null, size: null, packQuantity: null };
    }
    const record = attributes as Prisma.JsonObject;
    const color =
      typeof record.color === 'string' && record.color.trim() ? record.color.trim() : null;
    const size = typeof record.size === 'string' && record.size.trim() ? record.size.trim() : null;
    const packQuantity =
      typeof record.packQuantity === 'number' &&
      Number.isInteger(record.packQuantity) &&
      record.packQuantity > 0
        ? record.packQuantity
        : null;
    return { color, size, packQuantity };
  }

  private optionLabel(options: {
    color: string | null;
    size: string | null;
    packQuantity: number | null;
  }): string {
    return [
      options.color,
      options.size,
      options.packQuantity ? `Pack of ${options.packQuantity}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  private cartExpiry(): Date {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
}
