import {
  Injectable,
  UnauthorizedException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

export const SESSION_COOKIE = 'event_session';
export const SESSION_TTL_SECONDS = 15 * 60;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash(randomBytes(32), {
    type: argon2.argon2id,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async login(emailInput: unknown, passwordInput: unknown) {
    if (
      typeof emailInput !== 'string' ||
      typeof passwordInput !== 'string' ||
      emailInput.length > 320 ||
      passwordInput.length > 1024
    ) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    const email = emailInput.trim().toLowerCase();
    if (!email || !passwordInput) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    try {
      if (await this.redis.isAccountLocked(email)) {
        const seconds = Math.max(1, await this.redis.getLockTTL(email));
        throw new HttpException(
          {
            message: 'Đăng nhập tạm khoá. Thử lại sau ít phút.',
            retryAfterSeconds: seconds,
          },
          429,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Đăng nhập tạm thời không khả dụng. Thử lại sau.',
      );
    }

    // Existing accounts may retain mixed casing. Never pick an arbitrary
    // identity when two legacy rows differ only by email casing.
    const candidates = await this.prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      take: 2,
    });
    const user = candidates.length === 1 ? candidates[0] : undefined;
    const isMatch = await argon2.verify(
      user?.password ?? (await this.dummyHash),
      passwordInput,
    );
    if (!user || !isMatch || !user.isEmailVerified) {
      try {
        const failures = await this.redis.incrementLoginFailures(email);
        if (failures >= 5) {
          await this.redis.lockAccount(email);
          await this.redis.clearLoginFailures(email);
        }
      } catch {
        throw new ServiceUnavailableException(
          'Đăng nhập tạm thời không khả dụng. Thử lại sau.',
        );
      }
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    try {
      await this.redis.clearLoginFailures(email);
    } catch {
      throw new ServiceUnavailableException(
        'Đăng nhập tạm thời không khả dụng. Thử lại sau.',
      );
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    await this.prisma.session.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await this.prisma.session.create({
      data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt },
    });
    return { token, expiresAt };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
}
