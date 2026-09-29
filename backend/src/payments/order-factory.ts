import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { CheckoutQuote, Prisma, QuoteStatus } from '@prisma/client';

export function newOrderNumber(): string {
  return `GHC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function requireActiveQuote(quote: CheckoutQuote): void {
  if (quote.status !== QuoteStatus.ACTIVE || quote.expiresAt <= new Date()) {
    throw new BadRequestException('Checkout quote has expired');
  }
  if (quote.totalPaise <= 0 || quote.currency !== 'INR') {
    throw new BadRequestException('Checkout quote cannot be paid');
  }
}

export function orderCreateData(quote: CheckoutQuote): Prisma.OrderUncheckedCreateInput {
  return {
    orderNumber: newOrderNumber(),
    quoteId: quote.id,
    cartId: quote.cartId,
    userId: quote.userId,
    couponId: quote.couponId,
    currency: quote.currency,
    itemsSnapshot: toInputJson(quote.itemsSnapshot),
    addressSnapshot: toInputJson(quote.addressSnapshot),
    subtotalPaise: quote.subtotalPaise,
    discountPaise: quote.discountPaise,
    shippingPaise: quote.shippingPaise,
    taxPaise: quote.taxPaise,
    totalPaise: quote.totalPaise,
    paymentExpiresAt: quote.expiresAt,
  };
}

export function toInputJson(value: Prisma.JsonValue | object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
