import {
  CanActivate,
  ForbiddenException,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator.js';
import { hashSessionToken, SESSION_COOKIE } from '../auth.service.js';

export type AuthenticatedUser = { id: string; email: string; roles: string[] };
export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
  sessionToken: string;
};

function sessionTokenFromCookie(header: string | undefined): string | null {
  const cookie = header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      const fetchSite = request.headers['sec-fetch-site'];
      const allowedOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      if (
        (origin && origin !== allowedOrigin) ||
        (fetchSite && fetchSite !== 'same-origin')
      ) {
        throw new ForbiddenException('Nguồn yêu cầu không được phép.');
      }
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const token = sessionTokenFromCookie(request.headers.cookie);
    if (!token) throw new UnauthorizedException('Cần đăng nhập lại.');

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: { include: { userRoles: { include: { role: true } } } },
      },
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      !session.user.isEmailVerified
    ) {
      throw new UnauthorizedException('Phiên đã hết hạn. Đăng nhập lại.');
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      roles: session.user.userRoles.map(({ role }) => role.name),
    };
    request.sessionToken = token;
    return true;
  }
}
