import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAuditLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Id of the last record on the previous page. */
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/)
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
