import { AppRole } from '@prisma/client';
import { IsEmail, IsEnum, MaxLength } from 'class-validator';

export class GrantStaffAccessDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsEnum(AppRole)
  role!: AppRole;
}
