import { ProductStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export const ADMIN_PRODUCT_PAGE_SIZES = [20, 50, 100] as const;

export class ListAdminProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsIn(ADMIN_PRODUCT_PAGE_SIZES)
  limit: (typeof ADMIN_PRODUCT_PAGE_SIZES)[number] = 20;

  /** Matches product name, slug, or any option's SKU or alias (case-insensitive). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  /** Category id. */
  @IsOptional()
  @IsUUID()
  category?: string;
}
