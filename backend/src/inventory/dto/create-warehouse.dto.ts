import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Warehouse code may only contain capital letters, numbers, - and _',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
