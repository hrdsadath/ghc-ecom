import { DiscountType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Keeps paise amounts and counts well inside Postgres integer range. */
const MAX_COUPON_INTEGER = 1_000_000_000;

export class CreateCouponDto {
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Coupon code may only contain capital letters, numbers, - and _',
  })
  code!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  /** Basis points for PERCENT coupons (1500 = 15%), paise for FIXED coupons. */
  @IsInt()
  @Min(1)
  @Max(MAX_COUPON_INTEGER)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_COUPON_INTEGER)
  minimumSubtotalPaise?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUPON_INTEGER)
  maximumDiscountPaise?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUPON_INTEGER)
  usageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUPON_INTEGER)
  perUserLimit?: number | null;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
