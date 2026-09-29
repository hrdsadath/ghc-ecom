import { AppRole } from '@prisma/client';
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
    const audit = { list: jest.fn().mockResolvedValue([auditLog]) };
    const supabase = {
      listAdminUsers: jest.fn().mockResolvedValue([
        {
          id: 'admin-id',
          email: 'admin@example.com',
          user_metadata: { full_name: 'Faheem' },
        },
      ]),
    };
    const service = new AdminService({} as never, audit as never, supabase as never);

    await expect(service.listAuditLogs()).resolves.toEqual([
      expect.objectContaining({ actorLabel: 'Faheem · admin@example.com' }),
    ]);
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
      createAdminUser: jest.fn(),
      deleteAdminUser: jest.fn(),
      listAdminUsers: jest.fn(),
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
      metadata: { role: AppRole.SUPPORT_AGENT },
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
    const service = new AdminService(prisma as never, audit as never, {} as never, redis as never);

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
    expect(redis.delete).toHaveBeenCalledWith('auth:roles:staff-id');
  });

  it('does not let an administrator remove their own administrator access', async () => {
    const prisma = { userRole: { count: jest.fn(), deleteMany: jest.fn() } };
    const service = new AdminService(prisma as never, {} as never, {} as never);

    await expect(service.removeRole('admin-id', 'admin-id', AppRole.ADMIN, {})).rejects.toThrow(
      'You cannot remove your own administrator access',
    );
    expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('protects the final administrator from removal', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: {
        count: jest.fn().mockResolvedValue(1),
        deleteMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const service = new AdminService(prisma as never, {} as never, {} as never);

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
        count: jest.fn().mockResolvedValue(2),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(transaction)) };
    const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-id' }) };
    const service = new AdminService(prisma as never, audit as never, {} as never);

    await service.removeRole('admin-id', 'other-admin-id', AppRole.ADMIN, {});

    expect(transaction.$executeRaw).toHaveBeenCalled();
    expect(transaction.userRole.count).toHaveBeenCalledWith({ where: { role: AppRole.ADMIN } });
    expect(transaction.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'other-admin-id', role: AppRole.ADMIN },
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
      },
    };
    const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-id' }) };
    const supabase = {
      createAdminUser: jest.fn().mockResolvedValue(user),
      deleteAdminUser: jest.fn(),
      listAdminUsers: jest.fn(),
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
