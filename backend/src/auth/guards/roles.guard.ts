import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole } from '@prisma/client';
import { AuthenticatedRequest } from '../authenticated-user';
import { AuthService } from '../auth.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { roles, suspended } = await this.auth.access(request.user.id);
    if (suspended) {
      // Suspension takes effect before the account's access token expires.
      throw new UnauthorizedException('This account is suspended');
    }
    if (!requiredRoles.some((role) => roles.includes(role))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
