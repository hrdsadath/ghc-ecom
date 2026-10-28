import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppRole, Refund, ReturnRequest, Shipment } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CreateRefundDto } from './dto/create-refund.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ReviewReturnDto } from './dto/review-return.dto';
import { FulfilmentService, ReviewedReturn, ShipmentDetail } from './fulfilment.service';
import { RefundReconciliationResult, RefundsService } from './refunds.service';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class FulfilmentController {
  constructor(
    private readonly fulfilment: FulfilmentService,
    private readonly refunds: RefundsService,
    private readonly auth: AuthService,
  ) {}

  @Get('orders/:orderId/shipments')
  shipments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<ShipmentDetail[]> {
    return this.fulfilment.listMine(user.id, orderId);
  }

  @Post('orders/:orderId/returns')
  requestReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() input: CreateReturnDto,
  ): Promise<ReturnRequest> {
    return this.fulfilment.requestReturn(user.id, orderId, input);
  }

  @Post('admin/orders/:orderId/shipments')
  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN, AppRole.WAREHOUSE_MANAGER)
  createShipment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() input: CreateShipmentDto,
  ): Promise<Shipment> {
    return this.fulfilment.createShipment(actor.id, orderId, input);
  }

  /** Marking shipped moves the order and emails the customer, so it is fulfilment work, not support. */
  @Post('admin/orders/:orderId/mark-shipped')
  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN, AppRole.WAREHOUSE_MANAGER)
  markShipped(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<Shipment> {
    return this.fulfilment.markShipped(actor.id, orderId);
  }

  @Patch('admin/returns/:returnId')
  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT, AppRole.WAREHOUSE_MANAGER)
  async reviewReturn(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('returnId', ParseUUIDPipe) returnId: string,
    @Body() input: ReviewReturnDto,
  ): Promise<ReviewedReturn> {
    if (input.restock) {
      // Restocking changes inventory, which only inventory roles may do.
      const roles = await this.auth.roles(actor.id);
      if (!roles.some((role) => role === AppRole.ADMIN || role === AppRole.WAREHOUSE_MANAGER)) {
        throw new ForbiddenException('Only admins and warehouse managers can restock returns');
      }
    }
    return this.fulfilment.reviewReturn(actor.id, returnId, input);
  }

  @Post('admin/refunds')
  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
  refund(@CurrentUser() actor: AuthenticatedUser, @Body() input: CreateRefundDto): Promise<Refund> {
    return this.refunds.create(actor.id, input);
  }

  @Post('admin/refunds/reconcile')
  @UseGuards(RolesGuard)
  @Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
  reconcileRefunds(): Promise<RefundReconciliationResult> {
    return this.refunds.reconcilePending();
  }
}
