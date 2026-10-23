import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AppRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

const context = {
  getHandler: jest.fn(),
  getClass: jest.fn(),
  switchToHttp: () => ({
    getRequest: (): { user: { id: string } } => ({ user: { id: 'customer-id' } }),
  }),
} as unknown as ExecutionContext;

describe('RolesGuard', () => {
  it('rejects a user without a required admin role', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AppRole.ADMIN]),
    };
    const auth = {
      access: jest.fn().mockResolvedValue({ roles: [AppRole.CUSTOMER], suspended: false }),
    };
    const guard = new RolesGuard(reflector as never, auth as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.access).toHaveBeenCalledWith('customer-id');
  });

  it('allows a user with a required role', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AppRole.ADMIN]),
    };
    const auth = {
      access: jest.fn().mockResolvedValue({ roles: [AppRole.ADMIN], suspended: false }),
    };
    const adminContext = {
      ...context,
      switchToHttp: () => ({
        getRequest: (): { user: { id: string } } => ({ user: { id: 'admin-id' } }),
      }),
    } as ExecutionContext;
    const guard = new RolesGuard(reflector as never, auth as never);

    await expect(guard.canActivate(adminContext)).resolves.toBe(true);
  });

  it('rejects a suspended account even while its access token is valid', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AppRole.ADMIN]),
    };
    const auth = {
      access: jest.fn().mockResolvedValue({ roles: [AppRole.ADMIN], suspended: true }),
    };
    const guard = new RolesGuard(reflector as never, auth as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
