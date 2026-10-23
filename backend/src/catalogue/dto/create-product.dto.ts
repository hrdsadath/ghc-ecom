import { ProductStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const importSafeProductSummary = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 300) return normalized;
  const candidate = normalized.slice(0, 299);
  const wordBoundary = candidate.lastIndexOf(' ');
  const summary = wordBoundary >= 220 ? candidate.slice(0, wordBoundary) : candidate;
  return `${summary.trimEnd()}…`;
};

export class CreateProductDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsOptional()
  @Transform(({ value }) => importSafeProductSummary(value))
  @IsString()
  @MaxLength(300)
  shortDescription?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  material?: string | null;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(170)
  seoDescription?: string | null;
}
