import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { REGISTRATION_NOTICE } from 'shared/registration-notice';
import { RegistrationSettings } from './registration-settings.js';
import {
  ActivationDeliveryService,
  activationHash,
  encryptActivation,
} from './activation-delivery.service.js';
import type { Prisma } from '@prisma/client';

const GENERIC = { message: 'Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn.' };
export function registrationEmail(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length > 320 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.trim())
  )
    throw new BadRequestException({
      message: 'Kiểm tra lại thông tin.',
      errors: { email: 'Nhập email hợp lệ.' },
    });
  return input.trim().toLowerCase();
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly delivery: ActivationDeliveryService,
    private readonly settings: RegistrationSettings,
  ) {}

  notice() {
    return REGISTRATION_NOTICE;
  }

  private async activationTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Database exceptions can include parameters. Keep tokens/identity out of
      // Nest's unhandled-exception logger and return a recoverable service error.
      throw new ServiceUnavailableException(
        'Dịch vụ kích hoạt tạm thời chưa sẵn sàng. Hãy thử lại sau.',
      );
    }
  }

  private requireDelivery() {
    if (!this.delivery.available)
      throw new ServiceUnavailableException(
        'Đăng ký tạm thời chưa sẵn sàng. Vui lòng thử lại sau.',
      );
  }

  private async reserveDeliveryCapacity(peer: string) {
    try {
      // A single anonymous caller must not spend every other user's shared
      // provider capacity using nonexistent recipients or rejected resends.
      const caller = await this.redis.reserveRegistrationCaller(peer);
      if (caller.count > 30)
        throw new HttpException(
          {
            message: 'Đã đạt giới hạn yêu cầu đăng ký. Vui lòng thử lại sau.',
            retryAfterSeconds: caller.ttl,
          },
          429,
        );
      const budget = await this.redis.reserveRegistrationDelivery();
      if (budget.count > 120)
        throw new HttpException(
          {
            message:
              'Dịch vụ đăng ký đang nhận nhiều yêu cầu. Vui lòng thử lại sau.',
            retryAfterSeconds: budget.ttl,
          },
          429,
        );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Dịch vụ đăng ký tạm thời chưa sẵn sàng.',
      );
    }
  }

  private async issue(tx: Prisma.TransactionClient, userId: string) {
    const raw = randomBytes(32).toString('hex');
    const [{ now }] = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT clock_timestamp() AS now`;
    await tx.activationToken.create({
      data: {
        tokenHash: activationHash(raw),
        userId,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        mail: {
          create: {
            encryptedToken: encryptActivation(
              raw,
              this.settings.encryptionKey!,
            ),
          },
        },
      },
    });
  }

  async register(body: unknown, peer = 'internal-service') {
    const input =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const errors: Record<string, string> = {};
    let email = '';
    try {
      email = registrationEmail(input.email);
    } catch {
      errors.email = 'Nhập email hợp lệ.';
    }
    const name =
      typeof input.fullName === 'string' ? input.fullName.trim() : '';
    if (
      !name ||
      name.length > 120 ||
      [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      errors.fullName = 'Nhập họ tên giả từ 1 đến 120 ký tự.';
    if (
      typeof input.password !== 'string' ||
      input.password.length < 8 ||
      input.password.length > 1024
    )
      errors.password = 'Mật khẩu phải từ 8 đến 1024 ký tự.';
    if (
      input.consent !== true ||
      input.noticeVersion !== REGISTRATION_NOTICE.version
    )
      errors.consent = 'Hãy đọc và chủ động đồng ý đúng phiên bản thông báo.';
    if (Object.keys(errors).length)
      throw new BadRequestException({
        message: 'Kiểm tra lại thông tin.',
        errors,
      });
    this.requireDelivery();
    await this.reserveDeliveryCapacity(peer);
    // Identical Argon2 work for existing/new addresses avoids the former cheap
    // duplicate fast path. SMTP happens in the durable outbox, never in response.
    const password = await argon2.hash(input.password as string, {
      type: argon2.argon2id,
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'registration:' + email}, 0))`;
        const existing = await tx.user.findMany({
          where: { email: { equals: email, mode: 'insensitive' } },
          take: 1,
        });
        if (existing.length) return;
        const user = await tx.user.create({
          data: {
            email,
            password,
            fullName: name,
            isEmailVerified: false,
            userRoles: { create: { role: { connect: { name: 'BUYER' } } } },
            registrationConsent: {
              create: {
                noticeVersion: REGISTRATION_NOTICE.version,
                purpose: REGISTRATION_NOTICE.purpose,
                status: 'GRANTED',
              },
            },
          },
        });
        await this.issue(tx, user.id);
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002')
        throw new ServiceUnavailableException(
          'Đăng ký tạm thời chưa sẵn sàng. Vui lòng thử lại sau.',
        );
    }
    return GENERIC;
  }

  async resend(emailInput: unknown, peer = 'internal-service') {
    const email = registrationEmail(emailInput);
    this.requireDelivery();
    await this.reserveDeliveryCapacity(peer);
    try {
      const budget = await this.redis.reserveActivationResend(email);
      if (budget.count > 5)
        throw new HttpException(
          {
            message: 'Đã đạt giới hạn gửi lại. Vui lòng thử lại sau.',
            retryAfterSeconds: budget.ttl,
          },
          429,
        );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Chưa thể gửi lại. Vui lòng thử lại sau.',
      );
    }
    await this.activationTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'registration:' + email}, 0))`;
      const users = await tx.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        take: 2,
      });
      if (users.length !== 1) return;
      const [user] = await tx.$queryRaw<
        Array<{ id: string; isEmailVerified: boolean; isActive: boolean }>
      >`
        SELECT id,"isEmailVerified","isActive" FROM users WHERE id=${users[0].id}::uuid FOR UPDATE`;
      if (user.isEmailVerified || !user.isActive) return;
      await this.issue(tx, user.id);
    });
    return GENERIC;
  }

  async activate(input: unknown, passwordInput?: unknown) {
    if (typeof input !== 'string' || !/^[a-f0-9]{64}$/.test(input))
      throw new BadRequestException({
        message: 'Liên kết không hợp lệ. Bạn có thể yêu cầu gửi lại.',
        code: 'ACTIVATION_INVALID',
      });
    if (
      typeof passwordInput !== 'string' ||
      passwordInput.length < 8 ||
      passwordInput.length > 1024
    )
      throw new BadRequestException({
        message: 'Đặt mật khẩu từ 8 đến 1024 ký tự để hoàn tất kích hoạt.',
        errors: { password: 'Nhập mật khẩu mới hợp lệ.' },
      });
    // The mailbox holder chooses final credentials. An earlier anonymous
    // registration can never keep its password after the recipient activates.
    return this.activationTransaction(async (tx) => {
      const token = await tx.activationToken.findUnique({
        where: { tokenHash: activationHash(input) },
      });
      if (!token)
        throw new BadRequestException({
          message: 'Liên kết không hợp lệ. Bạn có thể yêu cầu gửi lại.',
          code: 'ACTIVATION_INVALID',
        });
      const [user] = await tx.$queryRaw<
        Array<{ id: string; isEmailVerified: boolean; isActive: boolean }>
      >`
        SELECT id,"isEmailVerified","isActive" FROM users WHERE id=${token.userId}::uuid FOR UPDATE`;
      const current = await tx.activationToken.findUniqueOrThrow({
        where: { tokenHash: token.tokenHash },
      });
      if (current.consumedAt || user.isEmailVerified)
        throw new BadRequestException({
          message: 'Liên kết đã được sử dụng. Hãy đăng nhập.',
          code: 'ACTIVATION_USED',
        });
      const [{ now }] = await tx.$queryRaw<
        Array<{ now: Date }>
      >`SELECT clock_timestamp() AS now`;
      if (current.expiresAt <= now)
        throw new BadRequestException({
          message: 'Liên kết đã hết hạn 24 giờ. Hãy yêu cầu gửi lại.',
          code: 'ACTIVATION_EXPIRED',
        });
      if (!user.isActive)
        throw new BadRequestException({
          message: 'Không thể kích hoạt tài khoản này.',
          code: 'ACTIVATION_INVALID',
        });
      const password = await argon2.hash(passwordInput, {
        type: argon2.argon2id,
      });
      await tx.activationToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true, password },
      });
      return { message: 'Tài khoản đã được kích hoạt. Bạn có thể đăng nhập.' };
    });
  }
}
