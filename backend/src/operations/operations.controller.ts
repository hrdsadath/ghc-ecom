import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { OperationsService, OperationsSnapshot } from './operations.service';

/** Explicit refreshes still share a query taken within this window. */
const FRESH_SNAPSHOT_MAX_AGE_MS = 5_000;

@Controller('admin/operations')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('dashboard')
  dashboard(@Query('fresh') fresh?: string): Promise<OperationsSnapshot> {
    return this.operations.snapshot(fresh === 'true' ? FRESH_SNAPSHOT_MAX_AGE_MS : undefined);
  }

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): Promise<string> {
    return this.operations.metrics();
  }
}
