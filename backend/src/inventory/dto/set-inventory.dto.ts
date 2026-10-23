import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const MAX_STOCK_QUANTITY = 1_000_000_000;

export class SetInventoryDto {
  @IsUUID()
  variantId!: string;

  /** Omit to keep the current on-hand quantity (for example when only the threshold changes). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK_QUANTITY)
  onHand?: number;

  /**
   * The on-hand quantity the editor loaded. When it no longer matches, the save is rejected
   * instead of silently overwriting stock that checkout or another admin changed meanwhile.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK_QUANTITY)
  expectedOnHand?: number;

  @IsInt()
  @Min(0)
  @Max(MAX_STOCK_QUANTITY)
  lowStockThreshold!: number;
}
