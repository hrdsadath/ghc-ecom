import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class MarkShippedDto {
  /** The shipping provider the parcel was handed to, shown to the customer. */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  provider!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trackingNumber!: string;
}
