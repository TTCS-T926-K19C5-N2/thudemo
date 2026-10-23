import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { REGISTRATION_NOTICE } from 'shared/registration-notice';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PrivacyService {
  constructor(private readonly db: PrismaService) {}
  async state(userId: string) {
    const version =
      process.env.SERVICE_POLICY_VERSION ?? REGISTRATION_NOTICE.version;
    const events = await this.db.consentEvent.findMany({
      where: { userId },
      orderBy: { eventNo: 'desc' },
      take: 100,
    });
    return {
      version,
      text:
        process.env.SERVICE_POLICY_TEXT ??
        REGISTRATION_NOTICE.paragraphs.join('\n\n'),
      requiresAcceptance:
        (events.some((e) => e.purpose === 'SERVICE') ||
          !!process.env.SERVICE_POLICY_VERSION) &&
        !events.some(
          (e) =>
            e.purpose === 'SERVICE' &&
            e.version === version &&
            e.status === 'GRANTED',
        ),
      marketing:
        events.find((e) => e.purpose === 'MARKETING')?.status === 'GRANTED',
      marketingEnabled: process.env.MARKETING_CONSENT_ENABLED === 'true',
      events,
      erasure: await this.db.erasureRequest.findUnique({ where: { userId } }),
    };
  }
  async consent(userId: string, input: unknown) {
    const body = input as Record<string, unknown> | null;
    const version =
      process.env.SERVICE_POLICY_VERSION ?? REGISTRATION_NOTICE.version;
    if (
      !body ||
      body.version !== version ||
      !['SERVICE', 'MARKETING'].includes(String(body.purpose)) ||
      typeof body.granted !== 'boolean' ||
      (body.purpose === 'SERVICE' && !body.granted)
    )
      throw new BadRequestException(
        'Xác nhận đúng phiên bản thông báo; rút tiếp thị riêng với yêu cầu xoá tài khoản.',
      );
    if (
      body.purpose === 'MARKETING' &&
      body.granted &&
      process.env.MARKETING_CONSENT_ENABLED !== 'true'
    )
      throw new BadRequestException(
        'Chưa bật mục đích tiếp thị. Bạn vẫn có thể rút đồng ý tiếp thị đã ghi trước đây.',
      );
    return this.db.consentEvent.create({
      data: {
        userId,
        purpose: String(body.purpose),
        version,
        status: body.granted ? 'GRANTED' : 'WITHDRAWN',
      },
    });
  }
  async requestErasure(userId: string) {
    return this.db.erasureRequest.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }
  async approveErasure(userId: string, adminId: string) {
    if (userId === adminId)
      throw new ConflictException('Không tự phê duyệt xoá tài khoản quản trị.');
    const password = await argon2.hash(randomBytes(32), {
      type: argon2.argon2id,
    });
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
      const request = await tx.erasureRequest.findUnique({ where: { userId } });
      if (!request)
        throw new NotFoundException('Tài khoản chưa yêu cầu xoá dữ liệu.');
      if (request.status === 'COMPLETED') return request;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.$queryRaw`SELECT m.id FROM activation_mail m JOIN activation_tokens t ON t."tokenHash"=m."tokenHash" WHERE t."userId"=${userId}::uuid FOR UPDATE OF m`;
      await tx.$queryRaw`SELECT m.id FROM ticket_mail_deliveries m JOIN orders o ON o.id=m."orderId" WHERE o."userId"=${userId}::uuid FOR UPDATE OF m`;
      await tx.$queryRaw`SELECT m.id FROM operation_mail m JOIN orders o ON o.id=m."orderId" WHERE o."userId"=${userId}::uuid FOR UPDATE OF m`;
      const pending = await tx.activationMail.count({
        where: { token: { userId }, status: 'SENDING' },
      });
      const sending = await tx.ticketMailDelivery.count({
        where: { order: { userId }, status: 'SENDING' },
      });
      const operationSending = await tx.operationMail.count({
        where: {
          orderId: {
            in: (
              await tx.order.findMany({
                where: { userId },
                select: { id: true },
              })
            ).map((o) => o.id),
          },
          status: 'SENDING',
        },
      });
      if (pending || sending || operationSending)
        throw new ConflictException(
          'Có thư đang gửi. Thử lại sau khi worker hoàn tất lượt hiện tại.',
        );
      await tx.$queryRaw`SELECT set_config('app.actor_id',${adminId},true)`;
      await tx.session.deleteMany({ where: { userId } });
      await tx.activationToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.activationMail.updateMany({
        where: { token: { userId } },
        data: { encryptedToken: '', status: 'CANCELLED', leaseUntil: null },
      });
      await tx.ticketMailDelivery.updateMany({
        where: { order: { userId }, status: { in: ['QUEUED', 'FAILED'] } },
        data: { status: 'CANCELLED', leaseUntil: null },
      });
      await tx.$executeRaw`UPDATE operation_mail SET status='CANCELLED' WHERE "orderId" IN (SELECT id FROM orders WHERE "userId"=${userId}::uuid) AND status IN ('QUEUED','FAILED')`;
      // Avoid stale recipient addresses in transferred tickets or gate labels.
      await tx.ticket.updateMany({
        where: {
          OR: [
            { order: { userId } },
            { ownerEmail: { equals: user.email, mode: 'insensitive' } },
          ],
        },
        data: { ownerEmail: null },
      });
      await tx.ticket.updateMany({
        where: {
          transferredToEmail: { equals: user.email, mode: 'insensitive' },
        },
        data: { transferredToEmail: null },
      });
      await tx.$executeRaw`UPDATE ticket_logs SET detail=detail-'toEmail'-'fromOwner' WHERE lower(detail->>'toEmail')=lower(${user.email}) OR lower(detail->>'fromOwner')=lower(${user.email})`;
      await tx.checkInPermission.updateMany({
        where: { userId },
        data: { staffName: 'Đã ẩn danh' },
      });
      await tx.ticketAdmission.updateMany({
        where: { staffId: userId },
        data: { staffName: 'Đã ẩn danh' },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `erased-${userId}@example.invalid`,
          fullName: null,
          password,
          isActive: false,
          activationToken: null,
          activationExpires: null,
        },
      });
      await tx.registrationConsent.updateMany({
        where: { userId },
        data: { status: 'WITHDRAWN' },
      });
      await tx.consentEvent.create({
        data: {
          userId,
          purpose: 'SERVICE',
          version:
            process.env.SERVICE_POLICY_VERSION ?? REGISTRATION_NOTICE.version,
          status: 'WITHDRAWN',
        },
      });
      await tx.consentEvent.create({
        data: {
          userId,
          purpose: 'MARKETING',
          version:
            process.env.SERVICE_POLICY_VERSION ?? REGISTRATION_NOTICE.version,
          status: 'WITHDRAWN',
        },
      });
      return tx.erasureRequest.update({
        where: { userId },
        data: {
          status: 'COMPLETED',
          approvedBy: adminId,
          completedAt: new Date(),
        },
      });
    });
  }
}
