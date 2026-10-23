import { ReturnStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewReturnDto {
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Only when marking a return RECEIVED: put the sold units back on hand. */
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}
