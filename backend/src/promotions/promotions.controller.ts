import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppRole, Coupon } from '@prisma/client';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CouponWithStats, PromotionsService } from './promotions.service';

@Controller('admin/promotions')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN, AppRole.CATALOGUE_MANAGER)
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get('coupons')
  list(): Promise<CouponWithStats[]> {
    return this.promotions.list();
  }

  @Post('coupons')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() input: CreateCouponDto): Promise<Coupon> {
    return this.promotions.create(actor.id, input);
  }

  @Patch('coupons/:couponId')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('couponId', ParseUUIDPipe) couponId: string,
    @Body() input: UpdateCouponDto,
  ): Promise<Coupon> {
    return this.promotions.update(actor.id, couponId, input);
  }
}
