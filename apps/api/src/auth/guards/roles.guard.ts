import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, IS_PUBLIC_KEY } from '../decorators/roles.decorator.js';
import type { RoleName } from '../roles.js';
import type { AuthenticatedRequest } from './session-auth.guard.js';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Default Deny: If no roles are specified, deny access.
    if (!requiredRoles || requiredRoles.length === 0) {
      this.logger.warn(
        `Access denied to route ${context.getHandler().name}: No roles declared (Default Deny)`,
      );
      throw new ForbiddenException('Access denied');
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      this.logger.warn(
        `Access denied to route ${context.getHandler().name}: role mismatch`,
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
