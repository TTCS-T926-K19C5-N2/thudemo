import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
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

    const user = await this.prisma.user.findUnique({ where: { email } });
    const isMatch = await argon2.verify(
      user?.password ?? (await this.dummyHash),
      passwordInput,
    );
    if (!user || !isMatch) {
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

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để kích hoạt tài khoản hoặc yêu cầu gửi lại liên kết mới.',
      );
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

  async register(emailInput: unknown, passwordInput: unknown) {
    const errors: Record<string, string> = {};
    if (typeof emailInput !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim()) || emailInput.length > 320) {
      errors.email = 'Vui lòng nhập địa chỉ email hợp lệ.';
    }
    if (typeof passwordInput !== 'string' || passwordInput.length < 8) {
      errors.password = 'Mật khẩu phải có ít nhất 8 ký tự.';
    } else if (passwordInput.length > 1024) {
      errors.password = 'Mật khẩu không được vượt quá 1024 ký tự.';
    }

    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        message: 'Dữ liệu đăng ký không hợp lệ.',
        errors,
      });
    }

    const email = (emailInput as string).trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // AC 2: Không tiết lộ email đã tồn tại (chống dò email)
      return {
        status: 'ok',
        message: 'Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn kích hoạt tài khoản qua email.',
      };
    }

    const passwordHash = await argon2.hash(passwordInput as string, {
      type: argon2.argon2id,
    });
    const activationToken = randomBytes(32).toString('hex');
    const activationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.$transaction(async (tx) => {
      let buyerRole = await tx.role.findUnique({ where: { name: 'BUYER' } });
      if (!buyerRole) {
        buyerRole = await tx.role.create({ data: { name: 'BUYER' } });
      }
      const newUser = await tx.user.create({
        data: {
          email,
          password: passwordHash,
          isEmailVerified: false,
          activationToken,
          activationExpires,
        },
      });
      await tx.userRole.create({
        data: {
          userId: newUser.id,
          roleId: buyerRole.id,
        },
      });
    });

    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const activationUrl = `${webOrigin}/activate?token=${activationToken}`;
    // Dev mock email logger (AC 1 & Acceptance Criteria Note)
    console.log(`[EMAIL_SERVICE_DEV] Gửi link kích hoạt tới ${email}: ${activationUrl}`);

    return {
      status: 'ok',
      message: 'Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn kích hoạt tài khoản qua email.',
      // Only include activationUrl in dev/test for convenience when testing without inbox
      ...(process.env.NODE_ENV !== 'production' ? { activationToken } : {}),
    };
  }

  async activate(tokenInput: unknown) {
    if (typeof tokenInput !== 'string' || !tokenInput.trim()) {
      throw new BadRequestException('Mã kích hoạt không hợp lệ.');
    }
    const token = tokenInput.trim();
    const user = await this.prisma.user.findFirst({
      where: { activationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Liên kết kích hoạt không tồn tại hoặc đã được sử dụng.');
    }

    if (user.activationExpires && user.activationExpires < new Date()) {
      throw new BadRequestException({
        message: 'Liên kết kích hoạt đã hết hạn (quá 24 giờ). Vui lòng yêu cầu gửi lại liên kết mới.',
        code: 'ACTIVATION_EXPIRED',
        email: user.email,
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        activationToken: null,
        activationExpires: null,
      },
    });

    return {
      status: 'ok',
      message: 'Kích hoạt tài khoản thành công! Bạn có thể đăng nhập ngay bây giờ.',
    };
  }

  async resendActivation(emailInput: unknown) {
    if (typeof emailInput !== 'string' || !emailInput.trim()) {
      throw new BadRequestException('Vui lòng cung cấp email hợp lệ.');
    }
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && !user.isEmailVerified) {
      const activationToken = randomBytes(32).toString('hex');
      const activationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { activationToken, activationExpires },
      });
      const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      const activationUrl = `${webOrigin}/activate?token=${activationToken}`;
      console.log(`[EMAIL_SERVICE_DEV] Gửi lại link kích hoạt tới ${email}: ${activationUrl}`);
    }

    // Luôn trả thông báo chung chống dò email
    return {
      status: 'ok',
      message: 'Nếu email hợp lệ và chưa kích hoạt, bạn sẽ nhận được hướng dẫn kích hoạt mới qua email.',
    };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
}
