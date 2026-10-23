import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderProductImagesDto {
  /** Every image of the product, first to last. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  imageIds!: string[];
}
