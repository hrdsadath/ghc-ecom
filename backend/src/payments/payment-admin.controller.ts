import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { HdfcPaymentsService, ReconciliationResult } from './hdfc/hdfc-payments.service';

class ReconcilePaymentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

@Controller('admin/payments')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
export class PaymentAdminController {
  constructor(private readonly hdfcPayments: HdfcPaymentsService) {}

  @Post('reconcile')
  reconcile(@Body() input: ReconcilePaymentsDto): Promise<ReconciliationResult> {
    return this.hdfcPayments.reconcilePending(input.limit);
  }
}
