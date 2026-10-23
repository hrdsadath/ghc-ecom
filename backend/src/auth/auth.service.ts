import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Session, User } from '@supabase/supabase-js';
import { AppRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { isTransientAuthError, SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';

export interface AuthResult {
  user: User | null;
  session: Session | null;
}

/**
 * Roles and suspension are cached together. The key changed from auth:roles when the cached value
 * became an object, so instances of the previous release never read the new shape mid-deploy.
 */
export const rolesCacheKey = (userId: string): string => `auth:access:${userId}`;
const ROLES_CACHE_TTL_SECONDS = 60;

export interface AccountAccess {
  roles: AppRole[];
  /** The account is banned in Supabase Auth (staff suspension). */
  suspended: boolean;
}

const isAccountAccess = (value: unknown): value is AccountAccess =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as AccountAccess).roles) &&
  typeof (value as AccountAccess).suspended === 'boolean';

export interface SignInContext {
  ipAddress?: string;
  userAgent?: string;
}

const unavailable = (): ServiceUnavailableException =>
  new ServiceUnavailableException('Sign-in service is temporarily unavailable. Please retry.');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private suspensionLookupWarned = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis?: RedisService,
    private readonly audit?: AuditService,
  ) {}

  async register(input: RegisterDto): Promise<AuthResult> {
    const emailRedirectTo = `${this.config.getOrThrow<string>('FRONTEND_ORIGIN')}/auth`;
    const { data, error } = await this.supabase.register(input, emailRedirectTo);
    if (error) {
      throw new BadRequestException('Registration could not be completed');
    }
    return data;
  }

  /** Roles that authorize requests. A suspended account has none, whatever it holds. */
  async roles(userId: string): Promise<AppRole[]> {
    const access = await this.access(userId);
    return access.suspended ? [] : access.roles;
  }

  /**
   * Roles plus suspension, cached for ROLES_CACHE_TTL_SECONDS. Suspending or reinstating an account
   * clears this entry, so an access token that is still valid stops (or resumes) working at once.
   */
  async access(userId: string): Promise<AccountAccess> {
    try {
      const cached = await this.redis?.getJson<unknown>(rolesCacheKey(userId));
      if (isAccountAccess(cached)) return cached;
    } catch {
      // Role authorization falls back to PostgreSQL if Redis is unavailable.
    }
    const [rows, suspended] = await Promise.all([
      this.prisma.userRole.findMany({ where: { userId }, select: { role: true } }),
      this.isSuspended(userId),
    ]);
    const access: AccountAccess = { roles: rows.map((row) => row.role), suspended };
    try {
      await this.redis?.setJson(rolesCacheKey(userId), access, ROLES_CACHE_TTL_SECONDS);
    } catch {
      // Role authorization remains correct without caching.
    }
    return access;
  }

  /**
   * Reads the Supabase ban from auth.users. If the database role cannot read auth.users this
   * answers false, and a suspension is enforced only by Supabase refusing sign-in and refresh.
   */
  private async isSuspended(userId: string): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ suspended: boolean }>>`
        select coalesce(banned_until > now(), false) as suspended
        from auth.users
        where id = ${userId}::uuid
      `;
      return rows[0]?.suspended === true;
    } catch (error) {
      if (!this.suspensionLookupWarned) {
        this.suspensionLookupWarned = true;
        this.logger.warn(
          `Suspension lookup in auth.users failed; relying on Supabase session checks: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return false;
    }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.login(email, password);
    if (error) {
      if (isTransientAuthError(error)) throw unavailable();
      throw new UnauthorizedException('Invalid email or password');
    }
    return data;
  }

  /**
   * Throws UnauthorizedException only when Supabase rejects the refresh token. Outages, timeouts
   * and rate limits become 503 so the browser keeps its session and retries.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.refresh(refreshToken);
    if (error) {
      if (isTransientAuthError(error)) throw unavailable();
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return data;
  }

  /** Records a successful staff sign-in in the audit log. Customer sign-ins are not recorded. */
  async recordSignIn(
    user: { id: string; email: string | null },
    roles: AppRole[],
    context: SignInContext,
  ): Promise<void> {
    const staffRoles = roles.filter((role) => role !== AppRole.CUSTOMER);
    if (!staffRoles.length || !this.audit) return;
    try {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.staff.signed_in',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          ...(user.email ? { entityLabel: user.email, email: user.email } : {}),
          roles: staffRoles,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    } catch (error) {
      // Signing in must not fail because the audit write did.
      this.logger.error(
        `Staff sign-in audit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  verifyAccessToken(accessToken: string): Promise<User> {
    return this.supabase.verifyAccessToken(accessToken);
  }

  logout(accessToken: string): Promise<void> {
    return this.supabase.logout(accessToken);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const redirectTo = `${this.config.getOrThrow<string>('FRONTEND_ORIGIN')}/auth/reset-password`;
    await this.supabase.requestPasswordReset(email, redirectTo);
  }

  async resetPassword(
    recoveryAccessToken: string,
    recoveryRefreshToken: string,
    password: string,
  ): Promise<void> {
    try {
      await this.supabase.resetPassword(recoveryAccessToken, recoveryRefreshToken, password);
    } catch {
      throw new UnauthorizedException('Password recovery link is invalid or expired');
    }
  }
}
