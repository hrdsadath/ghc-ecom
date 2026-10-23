import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_STOCK_QUANTITY } from './set-inventory.dto';

/** Keeps one import inside the 1 MB API body limit and one short transaction. */
export const MAX_BULK_INVENTORY_ROWS = 5_000;

export class BulkInventoryRowDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_STOCK_QUANTITY)
  onHand!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_STOCK_QUANTITY)
  lowStockThreshold!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK_QUANTITY)
  expectedOnHand?: number;
}

export class BulkSetInventoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_INVENTORY_ROWS, {
    message: `An import can change at most ${MAX_BULK_INVENTORY_ROWS} rows; split the file and retry.`,
  })
  @ValidateNested({ each: true })
  @Type(() => BulkInventoryRowDto)
  rows!: BulkInventoryRowDto[];
}
