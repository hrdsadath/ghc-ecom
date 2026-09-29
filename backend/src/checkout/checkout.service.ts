import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckoutQuote,
  Coupon,
  DiscountType,
  OrderStatus,
  Prisma,
  QuoteStatus,
} from '@prisma/client';
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
    const cart = await this.carts.requireAccessibleCart(input.cartId, authorization, guestToken);
    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const addressSnapshot = await this.addressSnapshot(cart, input);
    const subtotalPaise = cart.items.reduce(
      (sum, item) => sum + item.variant.pricePaise * item.quantity,
      0,
    );
    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
    const itemsSnapshot = this.itemsSnapshot(cart);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`select pg_advisory_xact_lock(
          hashtextextended(${cart.id}::text, 0)
        )`;
        const pending = await transaction.order.findFirst({
          where: {
            cartId: cart.id,
            status: OrderStatus.PAYMENT_PENDING,
            paymentExpiresAt: { gt: new Date() },
            quote: { status: QuoteStatus.ACTIVE, expiresAt: { gt: new Date() } },
          },
          include: { quote: true },
          orderBy: { createdAt: 'desc' },
        });
        if (pending) return pending.quote;
        await transaction.checkoutQuote.updateMany({
          where: { cartId: cart.id, status: QuoteStatus.ACTIVE },
          data: { status: QuoteStatus.EXPIRED },
        });
        await transaction.$executeRaw`select public.reserve_cart_inventory(
          ${cart.id}::uuid,
          ${expiresAt}::timestamptz
        )`;
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
      });
    } catch (error) {
      if (error instanceof Error && /insufficient inventory|cart is empty/i.test(error.message)) {
        throw new ConflictException('Requested inventory is unavailable');
      }
      throw error;
    }
  }

  private async addressSnapshot(
    cart: CartWithItems,
    input: CreateQuoteDto,
  ): Promise<Prisma.InputJsonObject> {
    if (cart.userId) {
      if (!input.addressId || input.shippingAddress) {
        throw new BadRequestException('Authenticated checkout requires addressId only');
      }
      const address = await this.prisma.address.findFirst({
        where: { id: input.addressId, userId: cart.userId },
      });
      if (!address) {
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

  private async validateCoupon(
    code: string,
    subtotalPaise: number,
    userId: string | null,
    client: Pick<
      Prisma.TransactionClient,
      '$executeRaw' | 'coupon' | 'couponRedemption' | 'checkoutQuote'
    > = this.prisma,
  ): Promise<Coupon> {
    const now = new Date();
    const normalizedCode = code.toUpperCase();
    await client.$executeRaw`select pg_advisory_xact_lock(
      hashtextextended(${'coupon:' + normalizedCode}::text, 0)
    )`;
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
