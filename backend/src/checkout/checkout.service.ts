import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Address, CheckoutQuote, Coupon, DiscountType, Prisma, QuoteStatus } from '@prisma/client';
import { CartService, CartWithItems } from '../cart/cart.service';
import { PrismaService } from '../database/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ShippingAddressDto } from './dto/shipping-address.dto';

const QUOTE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
  ) {}

  async createQuote(
    input: CreateQuoteDto,
    authorization?: string,
    guestToken?: string,
  ): Promise<CheckoutQuote> {
    // A signed-in cart belongs to the token's user, so the saved address can be read
    // alongside the cart instead of after it.
    const userId = await this.carts.optionalUserId(authorization);
    const [cart, savedAddress] = await Promise.all([
      this.carts.requireAccessibleCart(input.cartId, authorization, guestToken),
      userId && input.addressId && !input.shippingAddress
        ? this.prisma.address.findFirst({ where: { id: input.addressId, userId } })
        : Promise.resolve(null),
    ]);
    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const addressSnapshot = this.addressSnapshot(cart, input, savedAddress);
    const subtotalPaise = cart.items.reduce(
      (sum, item) => sum + item.variant.pricePaise * item.quantity,
      0,
    );
    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
    const itemsSnapshot = this.itemsSnapshot(cart);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          // The cart lock (and the coupon lock, always taken after it) come first in their own
          // statement, so the next statement's snapshot sees whatever the previous holder of
          // the lock committed.
          const couponLock = input.couponCode ? `coupon:${input.couponCode.toUpperCase()}` : null;
          await transaction.$executeRaw`select
            pg_advisory_xact_lock(hashtextextended(${cart.id}::text, 0)),
            case when ${couponLock}::text is not null
              then pg_advisory_xact_lock(hashtextextended(${couponLock}::text, 0))
            end`;
          // One round trip: reuse the quote behind an unexpired pending payment, or else
          // expire the cart's active quotes and reserve its stock.
          const [prepared] = await transaction.$queryRaw<{ pendingQuoteId: string | null }[]>`
            with pending as materialized (
              select payment_order.quote_id
              from public.orders as payment_order
              join public.checkout_quotes as quote on quote.id = payment_order.quote_id
              where payment_order.cart_id = ${cart.id}::uuid
                and payment_order.status = 'payment_pending'
                and payment_order.payment_expires_at > now()
                and quote.status = 'active'
                and quote.expires_at > now()
              order by payment_order.created_at desc
              limit 1
            ),
            expired as (
              update public.checkout_quotes
              set status = 'expired'
              where cart_id = ${cart.id}::uuid
                and status = 'active'
                and not exists (select 1 from pending)
              returning id
            ),
            reserved as materialized (
              select public.reserve_cart_inventory(${cart.id}::uuid, ${expiresAt}::timestamptz)
              where not exists (select 1 from pending)
            )
            select
              (select quote_id from pending) as "pendingQuoteId",
              (select count(*) from expired)::integer as expired,
              (select count(*) from reserved)::integer as reserved
          `;
          if (prepared?.pendingQuoteId) {
            return transaction.checkoutQuote.findUniqueOrThrow({
              where: { id: prepared.pendingQuoteId },
            });
          }
          const coupon = input.couponCode
            ? await this.validateCoupon(input.couponCode, subtotalPaise, cart.userId, transaction)
            : null;
          const discountPaise = this.discount(coupon, subtotalPaise);
          const taxablePaise = subtotalPaise - discountPaise;
          // Published catalogue prices are final customer prices and delivery is free.
          const shippingPaise = 0;
          const taxPaise = 0;
          const totalPaise = taxablePaise + shippingPaise + taxPaise;
          return transaction.checkoutQuote.create({
            data: {
              cartId: cart.id,
              userId: cart.userId,
              couponId: coupon?.id,
              itemsSnapshot,
              addressSnapshot,
              subtotalPaise,
              discountPaise,
              shippingPaise,
              taxPaise,
              totalPaise,
              expiresAt,
            },
          });
          // Each statement is a round trip to the database, and a coupon adds several more;
          // Prisma's 5 s default can expire mid-quote on a slow link (as with HDFC intents).
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (error instanceof Error && /insufficient inventory|cart is empty/i.test(error.message)) {
        throw new ConflictException('Requested inventory is unavailable');
      }
      throw error;
    }
  }

  private addressSnapshot(
    cart: CartWithItems,
    input: CreateQuoteDto,
    address: Address | null,
  ): Prisma.InputJsonObject {
    if (cart.userId) {
      if (!input.addressId || input.shippingAddress) {
        throw new BadRequestException('Authenticated checkout requires addressId only');
      }
      if (!address || address.userId !== cart.userId) {
        throw new NotFoundException('Address not found');
      }
      return {
        email: input.contactEmail.toLowerCase(),
        recipientName: address.recipientName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2 ?? '',
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
      };
    }
    if (!input.shippingAddress || input.addressId) {
      throw new BadRequestException('Guest checkout requires shippingAddress only');
    }
    return {
      ...this.guestAddress(input.shippingAddress),
      email: input.contactEmail.toLowerCase(),
    };
  }

  private guestAddress(address: ShippingAddressDto): Prisma.InputJsonObject {
    return {
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country.toUpperCase(),
    };
  }

  private itemsSnapshot(cart: CartWithItems): Prisma.InputJsonArray {
    return cart.items.map((item) => {
      const options = this.variantOptions(item.variant.attributes);
      const image = [...item.variant.imageLinks].sort(
        (left, right) =>
          left.image.sortOrder - right.image.sortOrder ||
          left.image.createdAt.getTime() - right.image.createdAt.getTime(),
      )[0]?.image;
      return {
        variantId: item.variantId,
        sku: item.variant.sku,
        alias: item.variant.alias,
        productName: item.variant.product.name,
        productSlug: item.variant.product.slug,
        categoryName: item.variant.product.category?.name ?? null,
        productDescription:
          item.variant.product.shortDescription ?? item.variant.product.description ?? null,
        productMaterial: item.variant.product.material ?? null,
        ...options,
        optionLabel: this.optionLabel(options),
        imageUrl: image?.thumbnailUrl ?? item.variant.product.images?.[0]?.thumbnailUrl ?? null,
        quantity: item.quantity,
        unitPricePaise: item.variant.pricePaise,
        lineTotalPaise: item.variant.pricePaise * item.quantity,
        attributes: item.variant.attributes,
      };
    }) as Prisma.InputJsonArray;
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
    return {
      color: typeof record.color === 'string' && record.color.trim() ? record.color.trim() : null,
      size: typeof record.size === 'string' && record.size.trim() ? record.size.trim() : null,
      packQuantity:
        typeof record.packQuantity === 'number' &&
        Number.isInteger(record.packQuantity) &&
        record.packQuantity > 0
          ? record.packQuantity
          : null,
    };
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

  /** Expects the caller's transaction to hold the `coupon:<CODE>` advisory lock. */
  private async validateCoupon(
    code: string,
    subtotalPaise: number,
    userId: string | null,
    client: Pick<Prisma.TransactionClient, 'coupon' | 'couponRedemption' | 'checkoutQuote'> = this
      .prisma,
  ): Promise<Coupon> {
    const now = new Date();
    const normalizedCode = code.toUpperCase();
    const coupon = await client.coupon.findFirst({
      where: {
        code: normalizedCode,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    });
    if (!coupon || subtotalPaise < coupon.minimumSubtotalPaise) {
      throw new BadRequestException('Coupon is invalid or ineligible');
    }
    const [totalRedemptions, activeReservations] = await Promise.all([
      client.couponRedemption.count({
        where: { couponId: coupon.id },
      }),
      client.checkoutQuote.count({
        where: {
          couponId: coupon.id,
          status: QuoteStatus.ACTIVE,
          expiresAt: { gt: now },
        },
      }),
    ]);
    if (coupon.usageLimit !== null && totalRedemptions + activeReservations >= coupon.usageLimit) {
      throw new BadRequestException('Coupon redemption limit reached');
    }
    if (coupon.perUserLimit !== null) {
      if (!userId) {
        throw new BadRequestException('This coupon requires an authenticated customer');
      }
      const [userRedemptions, activeUserReservations] = await Promise.all([
        client.couponRedemption.count({
          where: { couponId: coupon.id, userId },
        }),
        client.checkoutQuote.count({
          where: {
            couponId: coupon.id,
            userId,
            status: QuoteStatus.ACTIVE,
            expiresAt: { gt: now },
          },
        }),
      ]);
      if (userRedemptions + activeUserReservations >= coupon.perUserLimit) {
        throw new BadRequestException('Customer coupon redemption limit reached');
      }
    }
    return coupon;
  }

  private discount(coupon: Coupon | null, subtotalPaise: number): number {
    if (!coupon) {
      return 0;
    }
    const calculated =
      coupon.type === DiscountType.PERCENT
        ? Math.floor((subtotalPaise * coupon.value) / 10_000)
        : Math.min(coupon.value, subtotalPaise);
    return Math.min(calculated, coupon.maximumDiscountPaise ?? calculated, subtotalPaise);
  }
}
