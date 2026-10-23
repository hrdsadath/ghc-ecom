import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppRole, UserRole } from '@prisma/client';
import { Request } from 'express';
import { AdminService, AuditLogPageView, CreatedStaffUser, StaffUser } from './admin.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { GrantStaffAccessDto } from './dto/grant-staff-access.dto';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';

@Controller('admin')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('users')
  createStaffUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateStaffUserDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<CreatedStaffUser> {
    return this.adminService.createStaffUser(actor.id, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  /** Gives staff access to an account that already exists. */
  @Post('users/grant')
  grantStaffAccess(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: GrantStaffAccessDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<StaffUser> {
    return this.adminService.grantStaffAccess(actor.id, input, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Get('users')
  listStaffUsers(): Promise<StaffUser[]> {
    return this.adminService.listStaffUsers();
  }

  @Put('users/:userId/roles')
  assignRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: AssignRoleDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<UserRole> {
    return this.adminService.assignRole(actor.id, userId, input.role, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Delete('users/:userId/roles/:role')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('role', new ParseEnumPipe(AppRole)) role: AppRole,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.adminService.removeRole(actor.id, userId, role, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  /** Bans the account in Supabase Auth and revokes its sessions. */
  @Post('users/:userId/suspend')
  @HttpCode(HttpStatus.OK)
  suspendStaffUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<StaffUser> {
    return this.adminService.suspendStaffUser(actor.id, userId, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Post('users/:userId/reinstate')
  @HttpCode(HttpStatus.OK)
  reinstateStaffUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<StaffUser> {
    return this.adminService.reinstateStaffUser(actor.id, userId, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  /** Sends Supabase's reset-password email; the link is never returned to the caller. */
  @Post('users/:userId/password-reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  sendPasswordReset(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.adminService.sendPasswordReset(actor.id, userId, {
      ipAddress,
      userAgent: request.header('user-agent'),
    });
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: ListAuditLogsDto): Promise<AuditLogPageView> {
    return this.adminService.listAuditLogs(query);
  }
}
