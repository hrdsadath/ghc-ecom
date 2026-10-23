import { ConflictException, NotFoundException } from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { AuthApiError } from '@supabase/supabase-js';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  it('adds a human actor label to audit log records', async () => {
    const auditLog = {
      id: 'audit-id',
      actorId: 'admin-id',
      action: 'catalogue.product.updated',
      entityType: 'product',
      entityId: 'product-id',
      metadata: {},
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    };
    const audit = {
      list: jest.fn().mockResolvedValue({
        items: [
          auditLog,
          { ...auditLog, id: 'audit-2' },
          { ...auditLog, id: 'audit-3', actorId: null },
        ],
        nextCursor: 'audit-3',
      }),
    };
    const supabase = {
      getAdminUserById: jest.fn().mockResolvedValue({
        id: 'admin-id',
        email: 'admin@example.com',
        user_metadata: { full_name: 'Faheem' },
      }),
    };
    const service = new AdminService({} as never, audit as never, supabase as never);

    await expect(service.listAuditLogs({ limit: 3, entityType: 'product' })).resolves.toEqual({
      nextCursor: 'audit-3',
      items: [
        expect.objectContaining({ actorLabel: 'Faheem · admin@example.com' }),
        expect.objectContaining({ actorLabel: 'Faheem · admin@example.com' }),
        expect.objectContaining({ actorLabel: 'System' }),
      ],
    });
    expect(audit.list).toHaveBeenCalledWith({ limit: 3, entityType: 'product' });
    // Only the distinct actor is looked up, never the whole account list.
    expect(supabase.getAdminUserById).toHaveBeenCalledTimes(1);
  });

  it('lists staff from role assignments and looks up only those accounts', async () => {
    const prisma = {
      userRole: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'staff-a', role: AppRole.SUPPORT_AGENT },
          { userId: 'staff-b', role: AppRole.ADMIN },
          { userId: 'staff-a', role: AppRole.CATALOGUE_MANAGER },
          { userId: 'deleted', role: AppRole.WAREHOUSE_MANAGER },
        ]),
      },
    };
    const accounts: Record<string, unknown> = {
      'staff-a': {
        id: 'staff-a',
        email: 'a@example.com',
        user_metadata: { full_name: 'Asha' },
        created_at: '2026-01-01T00:00:00.000Z',
      },
      'staff-b': {
        id: 'staff-b',
        email: 'b@example.com',
        user_metadata: {},
        created_at: '2026-02-01T00:00:00.000Z',
      },
    };
    const supabase = {
      getAdminUserById: jest.fn(async (id: string) => accounts[id] ?? null),
    };
    const service = new AdminService(prisma as never, {} as never, supabase as never);

    await expect(service.listStaffUsers()).resolves.toEqual([
      expect.objectContaining({ id: 'staff-b', fullName: null, roles: [AppRole.ADMIN] }),
      expect.objectContaining({
        id: 'staff-a',
        fullName: 'Asha',
        roles: [AppRole.SUPPORT_AGENT, AppRole.CATALOGUE_MANAGER],
      }),
    ]);
    expect(prisma.userRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: { not: AppRole.CUSTOMER } } }),
    );
    expect(supabase.getAdminUserById).toHaveBeenCalledTimes(3);

    await service.listStaffUsers();
    expect(supabase.getAdminUserById).toHaveBeenCalledTimes(3);
  });

  it('answers 409 when a new staff email already has an account', async () => {
    const supabase = {
      createAdminUser: jest
        .fn()
        .mockRejectedValue(
          new AuthApiError(
            'A user with this email address has already been registered',
            422,
            'email_exists',
          ),
        ),
      deleteAdminUser: jest.fn(),
    };
    const service = new AdminService({} as never, {} as never, supabase as never);

    await expect(
      service.createStaffUser(
        'admin-id',
        { email: 'taken@example.com', role: AppRole.SUPPORT_AGENT },
        {},
      ),
    ).rejects.toThrow(ConflictException);
    expect(supabase.deleteAdminUser).not.toHaveBeenCalled();
  });

  it('grants staff access to an existing account found by email', async () => {
    const user = {
      id: 'existing-id',
      email: 'existing@example.com',
      user_metadata: { full_name: 'Existing Person' },
      created_at: '2026-03-01T00:00:00.000Z',
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'existing-id' }]),
      userRole: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ role: AppRole.WAREHOUSE_MANAGER }]),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const supabase = {
      getAdminUserById: jest.fn().mockResolvedValue(user),
      findAdminUserByEmail: jest.fn(),
    };
    const service = new AdminService(prisma as never, audit as never, supabase as never);

    await expect(
      service.grantStaffAccess(
        'admin-id',
        { email: ' Existing@Example.com ', role: AppRole.WAREHOUSE_MANAGER },
        {},
      ),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'existing-id', roles: [AppRole.WAREHOUSE_MANAGER] }),
    );
    expect(supabase.findAdminUserByEmail).not.toHaveBeenCalled();
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'existing-id', role: AppRole.CUSTOMER },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.role.assigned',
        metadata: {
          role: AppRole.WAREHOUSE_MANAGER,
          entityLabel: 'existing@example.com',
          email: 'existing@example.com',
        },
      }),
    );
  });

  it('falls back to the Auth API email search and reports a missing account', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('permission denied')) };
    const supabase = { findAdminUserByEmail: jest.fn().mockResolvedValue(null) };
    const service = new AdminService(prisma as never, {} as never, supabase as never);

    await expect(
      service.grantStaffAccess(
        'admin-id',
        { email: 'nobody@example.com', role: AppRole.ADMIN },
        {},
      ),
    ).rejects.toThrow(NotFoundException);
    expect(supabase.findAdminUserByEmail).toHaveBeenCalledWith('nobody@example.com');
  });

  it('records actor, action, target, and role for an admin role assignment', async () => {
    const assignment = {
      userId: 'target-id',
      role: AppRole.SUPPORT_AGENT,
      assignedBy: 'admin-id',
      assignedAt: new Date(),
    };
    const prisma = {
      userRole: {
        upsert: jest.fn().mockResolvedValue(assignment),
      },
    };
    const audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-id' }),
    };
    const supabase = {
      getAdminUserById: jest
        .fn()
        .mockResolvedValue({ id: 'target-id', email: 'target@example.com' }),
    };
    const service = new AdminService(prisma as never, audit as never, supabase as never);

    await expect(
      service.assignRole('admin-id', 'target-id', AppRole.SUPPORT_AGENT, {
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).resolves.toEqual(assignment);

    expect(audit.record).toHaveBeenCalledWith({
      actorId: 'admin-id',
      action: 'user.role.assigned',
      entityType: 'user',
      entityId: 'target-id',
      metadata: {
        role: AppRole.SUPPORT_AGENT,
        entityLabel: 'target@example.com',
        email: 'target@example.com',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
  });

  it('removes staff access, records the change, and clears the cached roles', async () => {
    const prisma = {
      userRole: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-id' }) };
    const redis = { delete: jest.fn().mockResolvedValue(1) };
    const supabase = { getAdminUserById: jest.fn().mockRejectedValue(new Error('offline')) };
    const service = new AdminService(
      prisma as never,
      audit as never,
      supabase as never,
      redis as never,
    );

    await service.removeRole('admin-id', 'staff-id', AppRole.SUPPORT_AGENT, {
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });

    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'staff-id', role: AppRole.SUPPORT_AGENT },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-id',
        action: 'user.role.removed',
        entityId: 'staff-id',
        metadata: { role: AppRole.SUPPORT_AGENT },
      }),
    );
    expect(redis.delete).toHaveBeenCalledWith('auth:access:staff-id');
  });

  it('does not let an administrator remove their own administrator access', async () => {
    const prisma = { userRole: { count: jest.fn(), deleteMany: jest.fn() } };
    const service = new AdminService(prisma as never, {} as never, {} as never);

    await expect(service.removeRole('admin-id', 'admin-id', AppRole.ADMIN, {})).rejects.toThrow(
      'You cannot remove your own administrator access',
    );
    expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('protects the final active administrator from removal', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: {
        // The only other administrator is suspended, so it does not count.
        findMany: jest.fn().mockResolvedValue([{ userId: 'suspended-admin-id' }]),
        deleteMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const supabase = {
      getAdminUserById: jest
        .fn()
        .mockResolvedValue({ id: 'suspended-admin-id', banned_until: '2126-01-01T00:00:00Z' }),
    };
    const service = new AdminService(prisma as never, {} as never, supabase as never);

    await expect(
      service.removeRole('admin-id', 'other-admin-id', AppRole.ADMIN, {}),
    ).rejects.toThrow('The final administrator cannot be removed');
    expect(transaction.$executeRaw).toHaveBeenCalled();
    expect(transaction.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('serializes the administrator invariant check with the removal', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'admin-id' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(transaction)) };
    const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-id' }) };
    const supabase = {
      getAdminUserById: jest.fn(async (id: string) =>
        id === 'admin-id' ? { id, email: 'admin@example.com' } : null,
      ),
    };
    const service = new AdminService(prisma as never, audit as never, supabase as never);

    await service.removeRole('admin-id', 'other-admin-id', AppRole.ADMIN, {});

    expect(transaction.$executeRaw).toHaveBeenCalled();
    expect(transaction.userRole.findMany).toHaveBeenCalledWith({
      where: { role: AppRole.ADMIN, userId: { not: 'other-admin-id' } },
      select: { userId: true },
    });
    expect(transaction.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'other-admin-id', role: AppRole.ADMIN },
    });
  });

  describe('suspension and password reset', () => {
    const context = { ipAddress: '127.0.0.1', userAgent: 'test-agent' };
    const banned = {
      id: 'staff-id',
      email: 'staff@example.com',
      user_metadata: {},
      created_at: '2026-08-01T00:00:00.000Z',
      banned_until: '2126-08-01T00:00:00.000Z',
    };

    interface Fixture {
      service: AdminService;
      prisma: { $transaction: jest.Mock; $executeRaw: jest.Mock };
      transaction: { $executeRaw: jest.Mock; userRole: { findMany: jest.Mock } };
      audit: { record: jest.Mock };
      supabase: {
        suspendAdminUser: jest.Mock;
        reinstateAdminUser: jest.Mock;
        getAdminUserById: jest.Mock;
      };
      redis: { delete: jest.Mock };
      auth: { requestPasswordReset: jest.Mock };
    }

    const setup = (
      roles: AppRole[],
      administrators: Array<Record<string, unknown> | null> = [],
    ): Fixture => {
      const transaction = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        userRole: {
          findMany: jest
            .fn()
            .mockResolvedValue(administrators.map((_, index) => ({ userId: `admin-${index}` }))),
        },
      };
      const prisma = {
        userRole: {
          findMany: jest
            .fn()
            .mockResolvedValue(roles.map((role) => ({ userId: 'staff-id', role }))),
        },
        $transaction: jest.fn((callback) => callback(transaction)),
        $executeRaw: jest.fn().mockResolvedValue(2),
      };
      const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-id' }) };
      const supabase = {
        suspendAdminUser: jest.fn().mockResolvedValue(banned),
        reinstateAdminUser: jest.fn().mockResolvedValue({ ...banned, banned_until: undefined }),
        getAdminUserById: jest.fn(async (id: string) =>
          id === 'staff-id'
            ? { ...banned, banned_until: undefined }
            : (administrators[Number(id.replace('admin-', ''))] ?? null),
        ),
      };
      const redis = { delete: jest.fn().mockResolvedValue(1) };
      const auth = { requestPasswordReset: jest.fn().mockResolvedValue(undefined) };
      const service = new AdminService(
        prisma as never,
        audit as never,
        supabase as never,
        redis as never,
        auth as never,
      );
      return { service, prisma, transaction, audit, supabase, redis, auth };
    };

    it('does not let an administrator suspend their own account', async () => {
      const { service, supabase } = setup([AppRole.ADMIN]);
      await expect(service.suspendStaffUser('staff-id', 'staff-id', context)).rejects.toThrow(
        'You cannot suspend your own account',
      );
      expect(supabase.suspendAdminUser).not.toHaveBeenCalled();
    });

    it('suspends staff, revokes sessions, clears cached access and records the target', async () => {
      const { service, prisma, audit, supabase, redis } = setup([AppRole.SUPPORT_AGENT]);

      await expect(service.suspendStaffUser('admin-id', 'staff-id', context)).resolves.toEqual(
        expect.objectContaining({
          id: 'staff-id',
          suspended: true,
          bannedUntil: '2126-08-01T00:00:00.000Z',
          roles: [AppRole.SUPPORT_AGENT],
        }),
      );
      expect(supabase.suspendAdminUser).toHaveBeenCalledWith('staff-id');
      // Only administrators need the invariant lock.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(redis.delete).toHaveBeenCalledWith('auth:access:staff-id');
      expect(audit.record).toHaveBeenCalledWith({
        actorId: 'admin-id',
        action: 'user.suspended',
        entityType: 'user',
        entityId: 'staff-id',
        metadata: {
          entityLabel: 'staff@example.com',
          email: 'staff@example.com',
          roles: [AppRole.SUPPORT_AGENT],
          sessionsRevoked: true,
        },
        ...context,
      });
    });

    it('still suspends when sessions cannot be revoked from the database', async () => {
      const { service, prisma, audit } = setup([AppRole.SUPPORT_AGENT]);
      prisma.$executeRaw.mockRejectedValueOnce(new Error('permission denied for schema auth'));
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      await service.suspendStaffUser('admin-id', 'staff-id', context);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ sessionsRevoked: false }),
        }),
      );
    });

    it('refuses to suspend the final active administrator', async () => {
      const { service, transaction, supabase } = setup(
        [AppRole.ADMIN],
        [{ id: 'admin-0', banned_until: '2126-01-01T00:00:00.000Z' }, null],
      );

      await expect(service.suspendStaffUser('admin-0', 'staff-id', context)).rejects.toThrow(
        'The final active administrator cannot be suspended',
      );
      expect(transaction.$executeRaw).toHaveBeenCalled();
      expect(transaction.userRole.findMany).toHaveBeenCalledWith({
        where: { role: AppRole.ADMIN, userId: { not: 'staff-id' } },
        select: { userId: true },
      });
      expect(supabase.suspendAdminUser).not.toHaveBeenCalled();
    });

    it('suspends an administrator under the invariant lock while another stays active', async () => {
      const { service, transaction, supabase } = setup(
        [AppRole.ADMIN],
        [{ id: 'admin-0', email: 'other@example.com' }],
      );

      await service.suspendStaffUser('admin-0', 'staff-id', context);

      expect(transaction.$executeRaw).toHaveBeenCalled();
      expect(supabase.suspendAdminUser).toHaveBeenCalledWith('staff-id');
    });

    it('answers 404 for an account without staff access', async () => {
      const { service, supabase } = setup([]);
      await expect(service.suspendStaffUser('admin-id', 'customer-id', context)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.sendPasswordReset('admin-id', 'customer-id', context)).rejects.toThrow(
        NotFoundException,
      );
      expect(supabase.suspendAdminUser).not.toHaveBeenCalled();
    });

    it('reinstates a suspended account and records it', async () => {
      const { service, audit, supabase, redis } = setup([AppRole.CATALOGUE_MANAGER]);

      await expect(service.reinstateStaffUser('admin-id', 'staff-id', context)).resolves.toEqual(
        expect.objectContaining({ suspended: false, bannedUntil: null }),
      );
      expect(supabase.reinstateAdminUser).toHaveBeenCalledWith('staff-id');
      expect(redis.delete).toHaveBeenCalledWith('auth:access:staff-id');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.reinstated',
          entityId: 'staff-id',
          metadata: {
            entityLabel: 'staff@example.com',
            email: 'staff@example.com',
            roles: [AppRole.CATALOGUE_MANAGER],
          },
        }),
      );
    });

    it('sends the reset email through the storefront reset flow and returns nothing', async () => {
      const { service, audit, auth } = setup([AppRole.SUPPORT_AGENT]);

      await expect(
        service.sendPasswordReset('admin-id', 'staff-id', context),
      ).resolves.toBeUndefined();
      expect(auth.requestPasswordReset).toHaveBeenCalledWith('staff@example.com');
      expect(audit.record).toHaveBeenCalledWith({
        actorId: 'admin-id',
        action: 'user.password_reset.sent',
        entityType: 'user',
        entityId: 'staff-id',
        metadata: { entityLabel: 'staff@example.com', email: 'staff@example.com' },
        ...context,
      });
    });

    it('does not send a reset to a suspended account', async () => {
      const { service, supabase, auth } = setup([AppRole.SUPPORT_AGENT]);
      supabase.getAdminUserById.mockResolvedValueOnce(banned);
      await expect(service.sendPasswordReset('admin-id', 'staff-id', context)).rejects.toThrow(
        'Reinstate this account before sending a password reset',
      );
      expect(auth.requestPasswordReset).not.toHaveBeenCalled();
    });

    it('reports a Supabase email rate limit as 429 without auditing', async () => {
      const { service, audit, auth } = setup([AppRole.SUPPORT_AGENT]);
      auth.requestPasswordReset.mockRejectedValueOnce(
        new AuthApiError(
          'For security purposes, you can only request this after 60 seconds.',
          429,
          'over_email_send_rate_limit',
        ),
      );
      await expect(
        service.sendPasswordReset('admin-id', 'staff-id', context),
      ).rejects.toMatchObject({ status: 429 });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('creates a confirmed staff account with a generated password and selected role', async () => {
    const user = {
      id: 'staff-id',
      email: 'staff@example.com',
      user_metadata: { full_name: 'Store Staff' },
      created_at: '2026-08-06T00:00:00.000Z',
    };
    const prisma = {
      userRole: {
        upsert: jest.fn().mockResolvedValue({ userId: user.id, role: AppRole.WAREHOUSE_MANAGER }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-id' }) };
    const supabase = {
      createAdminUser: jest.fn().mockResolvedValue(user),
      deleteAdminUser: jest.fn(),
    };
    const service = new AdminService(prisma as never, audit as never, supabase as never);

    const result = await service.createStaffUser(
      'admin-id',
      { email: 'STAFF@EXAMPLE.COM', fullName: 'Store Staff', role: AppRole.WAREHOUSE_MANAGER },
      { ipAddress: '127.0.0.1', userAgent: 'test-agent' },
    );

    expect(supabase.createAdminUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'staff@example.com',
        fullName: 'Store Staff',
        password: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/),
      }),
    );
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'staff-id', role: AppRole.CUSTOMER },
    });
    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          email: 'staff@example.com',
          roles: [AppRole.WAREHOUSE_MANAGER],
        }),
        temporaryPassword: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/),
      }),
    );
  });
});
