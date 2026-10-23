import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  sku!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  alias?: string | null;

  /** @deprecated Accepted temporarily for catalogue import compatibility; use alias. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/)
  barcode?: string | null;

  @IsInt()
  @Min(0)
  pricePaise!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPricePaise?: number | null;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  /** null removes the colour (and its swatch) from an existing variant. */
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  color?: string | null;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  colorHex?: string | null;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  size?: string | null;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsInt()
  @Min(1)
  packQuantity?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
