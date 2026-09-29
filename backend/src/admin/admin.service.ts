import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppRole, AuditLog, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SupabaseService } from '../supabase/supabase.service';
import { rolesCacheKey } from '../auth/auth.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface StaffUser {
  id: string;
  email: string;
  fullName: string | null;
  roles: AppRole[];
  createdAt: string;
}

export interface CreatedStaffUser {
  user: StaffUser;
  temporaryPassword: string;
}

export interface AuditLogView extends AuditLog {
  actorLabel: string | null;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseService,
    private readonly redis?: RedisService,
  ) {}

  async createStaffUser(
    actorId: string,
    input: CreateStaffUserDto,
    context: RequestContext,
  ): Promise<CreatedStaffUser> {
    if (input.role === AppRole.CUSTOMER) {
      throw new BadRequestException('Staff accounts must use an administrative role');
    }
    const temporaryPassword = randomBytes(18).toString('base64url');
    const email = input.email.trim().toLowerCase();
    let userId: string | null = null;
    try {
      const user = await this.supabase.createAdminUser({
        email,
        password: temporaryPassword,
        fullName: input.fullName?.trim() || email,
      });
      userId = user.id;
      await this.assignRole(actorId, user.id, input.role, context);
      return {
        user: {
          id: user.id,
          email: user.email || email,
          fullName:
            typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : null,
          roles: [input.role],
          createdAt: user.created_at,
        },
        temporaryPassword,
      };
    } catch (error) {
      if (userId) {
        try {
          await this.supabase.deleteAdminUser(userId);
        } catch {
          // The original failure is more actionable; cleanup is best-effort.
        }
      }
      throw error;
    }
  }

  async listStaffUsers(): Promise<StaffUser[]> {
    const users = await this.supabase.listAdminUsers();
    const roles = await this.prisma.userRole.findMany({
      where: {
        userId: { in: users.map((user) => user.id) },
        role: { not: AppRole.CUSTOMER },
      },
      orderBy: { assignedAt: 'desc' },
    });
    const rolesByUser = new Map<string, AppRole[]>();
    for (const assignment of roles) {
      rolesByUser.set(assignment.userId, [
        ...(rolesByUser.get(assignment.userId) || []),
        assignment.role,
      ]);
    }
    return users
      .filter((user) => rolesByUser.has(user.id))
      .map((user) => ({
        id: user.id,
        email: user.email || '',
        fullName:
          typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : null,
        roles: rolesByUser.get(user.id) || [],
        createdAt: user.created_at,
      }));
  }

  async assignRole(
    actorId: string,
    userId: string,
    role: AppRole,
    context: RequestContext,
  ): Promise<UserRole> {
    if (role === AppRole.CUSTOMER) {
      throw new BadRequestException('Customer access cannot be managed from the staff workspace');
    }
    const assignment = await this.prisma.userRole.upsert({
      where: {
        userId_role: { userId, role },
      },
      create: {
        userId,
        role,
        assignedBy: actorId,
      },
      update: {
        assignedBy: actorId,
        assignedAt: new Date(),
      },
    });

    await this.audit.record({
      actorId,
      action: 'user.role.assigned',
      entityType: 'user',
      entityId: userId,
      metadata: { role },
      ...context,
    });
    try {
      await this.redis?.delete(rolesCacheKey(userId));
    } catch {
      // The short TTL bounds stale role cache entries if Redis is unavailable.
    }
    return assignment;
  }

  async removeRole(
    actorId: string,
    userId: string,
    role: AppRole,
    context: RequestContext,
  ): Promise<void> {
    if (role === AppRole.CUSTOMER) {
      throw new BadRequestException('Customer access cannot be managed from the staff workspace');
    }
    if (role === AppRole.ADMIN) {
      if (actorId === userId) {
        throw new BadRequestException('You cannot remove your own administrator access');
      }
    }

    const result =
      role === AppRole.ADMIN
        ? await this.prisma.$transaction(async (transaction) => {
            await transaction.$executeRaw`select pg_advisory_xact_lock(
              hashtextextended('staff-admin-role-invariant', 0)
            )`;
            const administratorCount = await transaction.userRole.count({
              where: { role: AppRole.ADMIN },
            });
            if (administratorCount <= 1) {
              throw new BadRequestException('The final administrator cannot be removed');
            }
            return transaction.userRole.deleteMany({ where: { userId, role } });
          })
        : await this.prisma.userRole.deleteMany({ where: { userId, role } });
    if (!result.count) return;

    await this.audit.record({
      actorId,
      action: 'user.role.removed',
      entityType: 'user',
      entityId: userId,
      metadata: { role },
      ...context,
    });
    try {
      await this.redis?.delete(rolesCacheKey(userId));
    } catch {
      // The short TTL bounds stale role cache entries if Redis is unavailable.
    }
  }

  async listAuditLogs(): Promise<AuditLogView[]> {
    const logs = await this.audit.list();
    try {
      const users = await this.supabase.listAdminUsers();
      const actorLabels = new Map(
        users.map((user) => [
          user.id,
          typeof user.user_metadata.full_name === 'string' && user.user_metadata.full_name.trim()
            ? `${user.user_metadata.full_name.trim()}${user.email ? ` · ${user.email}` : ''}`
            : user.email || user.id,
        ]),
      );
      return logs.map((log) => ({
        ...log,
        actorLabel: log.actorId ? (actorLabels.get(log.actorId) ?? null) : 'System',
      }));
    } catch {
      return logs.map((log) => ({ ...log, actorLabel: log.actorId ? null : 'System' }));
    }
  }
}
