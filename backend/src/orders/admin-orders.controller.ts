import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ListAdminOrdersDto } from './dto/list-admin-orders.dto';
import { TransitionOrderDto } from './dto/transition-order.dto';
import { AdminOrderSummary, OrderDetail, OrdersService, RevenueReport } from './orders.service';

@Controller('admin/orders')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT, AppRole.WAREHOUSE_MANAGER)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() input: ListAdminOrdersDto): Promise<AdminOrderSummary[]> {
    return this.orders.listAdmin(input);
  }

  /** Dashboard revenue: admin-only, unlike the rest of this controller. */
  @Get('revenue')
  @Roles(AppRole.ADMIN)
  revenue(): Promise<RevenueReport> {
    return this.orders.revenue(7);
  }

  @Get(':orderId')
  detail(@Param('orderId', ParseUUIDPipe) orderId: string): Promise<OrderDetail> {
    return this.orders.getAdmin(orderId);
  }

  @Get(':orderId/invoice')
  invoice(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.orders.adminInvoiceUrl(orderId);
  }

  /** Fulfilment moves are warehouse work; support staff only view orders and handle returns. */
  @Patch(':orderId/status')
  @Roles(AppRole.ADMIN, AppRole.WAREHOUSE_MANAGER)
  transition(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() input: TransitionOrderDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<OrderDetail> {
    return this.orders.transition(actor.id, orderId, input.status, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  /** Cancels a paid, unshipped order; stock is released and the payment refunded automatically. */
  @Post(':orderId/cancel')
  @Roles(AppRole.ADMIN)
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() input: CancelOrderDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<OrderDetail> {
    return this.orders.cancelAdmin(actor.id, orderId, input.reason, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }
}
