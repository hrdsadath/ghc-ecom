import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const authData = {
    user: { id: 'user-id', email: 'customer@example.com' },
    session: { access_token: 'access-token', refresh_token: 'refresh-token' },
  };
  const supabase = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
  };
  const service = new AuthService(
    supabase as never,
    config as never,
    { userRole: { findMany: jest.fn() } } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers, logs in, refreshes, logs out, and requests password reset', async () => {
    supabase.register.mockResolvedValue({ data: authData, error: null });
    supabase.login.mockResolvedValue({ data: authData, error: null });
    supabase.refresh.mockResolvedValue({ data: authData, error: null });
    supabase.logout.mockResolvedValue(undefined);
    supabase.requestPasswordReset.mockResolvedValue(undefined);
    supabase.resetPassword.mockResolvedValue(undefined);

    await expect(
      service.register({
        email: 'customer@example.com',
        password: 'password123',
        fullName: 'Customer',
      }),
    ).resolves.toEqual(authData);
    expect(supabase.register).toHaveBeenCalledWith(
      {
        email: 'customer@example.com',
        password: 'password123',
        fullName: 'Customer',
      },
      'http://localhost:3000/auth',
    );
    await expect(service.login('customer@example.com', 'password123')).resolves.toEqual(authData);
    await expect(service.refresh('refresh-token')).resolves.toEqual(authData);
    await expect(service.logout('access-token')).resolves.toBeUndefined();
    await expect(service.requestPasswordReset('customer@example.com')).resolves.toBeUndefined();
    await expect(
      service.resetPassword('recovery-access-token', 'recovery-refresh-token', 'long-new-password'),
    ).resolves.toBeUndefined();

    expect(supabase.requestPasswordReset).toHaveBeenCalledWith(
      'customer@example.com',
      'http://localhost:3000/auth/reset-password',
    );
    expect(supabase.resetPassword).toHaveBeenCalledWith(
      'recovery-access-token',
      'recovery-refresh-token',
      'long-new-password',
    );
  });

  it('does not expose the provider login error', async () => {
    supabase.login.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('provider detail'),
    });

    await expect(service.login('customer@example.com', 'incorrect')).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
  });

  it('treats only a rejected refresh token as signed out', async () => {
    supabase.refresh.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthApiError(
        'Invalid Refresh Token: Already Used',
        400,
        'refresh_token_already_used',
      ),
    });
    await expect(service.refresh('used-token')).rejects.toThrow(UnauthorizedException);

    supabase.refresh.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError('fetch failed', 0),
    });
    await expect(service.refresh('refresh-token')).rejects.toThrow(ServiceUnavailableException);

    supabase.refresh.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'),
    });
    await expect(service.refresh('refresh-token')).rejects.toThrow(ServiceUnavailableException);
  });

  it('reports an Auth outage at sign-in as unavailable, not as wrong credentials', async () => {
    supabase.login.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('upstream unavailable', 503, 'unexpected_failure'),
    });
    await expect(service.login('staff@example.com', 'password123')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('records staff sign-ins in the audit log and skips customers', async () => {
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const audited = new AuthService(
      supabase as never,
      config as never,
      {} as never,
      undefined,
      audit as never,
    );
    const context = { ipAddress: '10.0.0.1', userAgent: 'agent' };

    await audited.recordSignIn(
      { id: 'customer-id', email: 'c@example.com' },
      [AppRole.CUSTOMER],
      context,
    );
    expect(audit.record).not.toHaveBeenCalled();

    await audited.recordSignIn(
      { id: 'staff-id', email: 'staff@example.com' },
      [AppRole.SUPPORT_AGENT],
      context,
    );
    expect(audit.record).toHaveBeenCalledWith({
      actorId: 'staff-id',
      action: 'auth.staff.signed_in',
      entityType: 'user',
      entityId: 'staff-id',
      metadata: {
        entityLabel: 'staff@example.com',
        email: 'staff@example.com',
        roles: [AppRole.SUPPORT_AGENT],
      },
      ipAddress: '10.0.0.1',
      userAgent: 'agent',
    });

    audit.record.mockRejectedValueOnce(new Error('database unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      audited.recordSignIn({ id: 'staff-id', email: null }, [AppRole.ADMIN], context),
    ).resolves.toBeUndefined();
  });

  it('returns a safe registration error', async () => {
    supabase.register.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('Email is already registered'),
    });

    await expect(
      service.register({
        email: 'customer@example.com',
        password: 'password123',
        fullName: 'Customer',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('caches roles used by authenticated frontend sections', async () => {
    const findMany = jest.fn().mockResolvedValue([{ role: 'CUSTOMER' }]);
    const values = new Map<string, unknown>();
    const redis = {
      getJson: jest.fn(async (key: string) => values.get(key) ?? null),
      setJson: jest.fn(async (key: string, value: unknown) => values.set(key, value)),
    };
    const cachedService = new AuthService(
      supabase as never,
      config as never,
      { userRole: { findMany } } as never,
      redis as never,
    );

    await cachedService.roles('user-id');
    await cachedService.roles('user-id');

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(values.get('auth:access:user-id')).toEqual({ roles: ['CUSTOMER'], suspended: false });
  });

  it('reads suspension with the roles and grants a suspended account no roles', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ suspended: true }]);
    const suspendedService = new AuthService(
      supabase as never,
      config as never,
      {
        userRole: { findMany: jest.fn().mockResolvedValue([{ role: AppRole.ADMIN }]) },
        $queryRaw: queryRaw,
      } as never,
    );

    await expect(suspendedService.access('staff-id')).resolves.toEqual({
      roles: [AppRole.ADMIN],
      suspended: true,
    });
    await expect(suspendedService.roles('staff-id')).resolves.toEqual([]);
    expect(queryRaw).toHaveBeenCalled();
  });

  it('treats an unreadable auth.users as not suspended', async () => {
    const unreadable = new AuthService(
      supabase as never,
      config as never,
      {
        userRole: { findMany: jest.fn().mockResolvedValue([{ role: AppRole.SUPPORT_AGENT }]) },
        $queryRaw: jest.fn().mockRejectedValue(new Error('permission denied for schema auth')),
      } as never,
    );

    await expect(unreadable.roles('staff-id')).resolves.toEqual([AppRole.SUPPORT_AGENT]);
  });

  it('ignores role cache entries written in the previous array format', async () => {
    const findMany = jest.fn().mockResolvedValue([{ role: AppRole.ADMIN }]);
    const redis = {
      getJson: jest.fn().mockResolvedValue([AppRole.ADMIN]),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    const migrated = new AuthService(
      supabase as never,
      config as never,
      { userRole: { findMany }, $queryRaw: jest.fn().mockResolvedValue([]) } as never,
      redis as never,
    );

    await expect(migrated.access('staff-id')).resolves.toEqual({
      roles: [AppRole.ADMIN],
      suspended: false,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
