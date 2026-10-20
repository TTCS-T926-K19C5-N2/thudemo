import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  CURRENT_POLICIES,
  PolicyType,
  ConsentStatus,
  type PolicyTypeValue,
} from 'shared/policy-registry';

export interface UserConsentDto {
  type: string;
  title: string;
  version: string | null;
  activeVersion: string;
  status: string;
  mandatory: boolean;
  consentedAt: Date | null;
  revokedAt: Date | null;
  needsReconsent: boolean;
}

export interface ConsentStatusResponse {
  consents: UserConsentDto[];
  pendingPolicies: Array<{
    type: string;
    title: string;
    requiredVersion: string;
    currentVersion: string | null;
    mandatory: boolean;
  }>;
  needsReconsent: boolean;
}

@Injectable()
export class ConsentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  getPublicPolicies() {
    return CURRENT_POLICIES;
  }

  async getConsentStatus(userId: string): Promise<ConsentStatusResponse> {
    const records = await this.prisma.userConsent.findMany({
      where: { userId },
    });
    const recordMap = new Map(records.map((r) => [r.type, r]));

    const consents: UserConsentDto[] = [];
    const pendingPolicies: ConsentStatusResponse['pendingPolicies'] = [];

    for (const key of Object.keys(CURRENT_POLICIES) as Array<
      keyof typeof CURRENT_POLICIES
    >) {
      const policy = CURRENT_POLICIES[key];
      const record = recordMap.get(policy.type);

      const status = record ? record.status : 'UNSET';
      const version = record ? record.version : null;
      const consentedAt = record ? record.consentedAt : null;
      const revokedAt = record ? record.revokedAt : null;

      // Mandatory policy needs reconsent if not granted or version differs
      const needsReconsent =
        policy.mandatory &&
        (status !== ConsentStatus.GRANTED || version !== policy.version);

      if (needsReconsent) {
        pendingPolicies.push({
          type: policy.type,
          title: policy.title,
          requiredVersion: policy.version,
          currentVersion: version,
          mandatory: policy.mandatory,
        });
      }

      consents.push({
        type: policy.type,
        title: policy.title,
        version,
        activeVersion: policy.version,
        status,
        mandatory: policy.mandatory,
        consentedAt,
        revokedAt,
        needsReconsent,
      });
    }

    return {
      consents,
      pendingPolicies,
      needsReconsent: pendingPolicies.length > 0,
    };
  }

  async agreeConsents(
    userId: string,
    input: unknown,
    peerIp?: string,
    userAgent?: string,
  ): Promise<ConsentStatusResponse> {
    const rawPolicies =
      input && typeof input === 'object' && 'policies' in input
        ? (input as { policies: unknown }).policies
        : input && typeof input === 'object' && 'type' in input
          ? [input]
          : undefined;

    if (!Array.isArray(rawPolicies) || rawPolicies.length === 0) {
      throw new BadRequestException('Danh sách điều khoản cần đồng ý không hợp lệ.');
    }

    const validPoliciesToApply: Array<{ type: string; version: string }> = [];

    for (const item of rawPolicies) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Dữ liệu điều khoản không hợp lệ.');
      }
      const p = item as { type?: unknown; version?: unknown };
      if (typeof p.type !== 'string' || typeof p.version !== 'string') {
        throw new BadRequestException('Thiếu thông tin loại hoặc phiên bản điều khoản.');
      }
      const known = (
        Object.values(CURRENT_POLICIES) as Array<{
          type: string;
          version: string;
        }>
      ).find((def) => def.type === p.type);
      if (!known) {
        throw new BadRequestException(`Loại điều khoản '${p.type}' không tồn tại trong hệ thống.`);
      }
      if (known.version !== p.version) {
        throw new BadRequestException(
          `Phiên bản điều khoản '${p.version}' không khớp với phiên bản hiện hành '${known.version}'.`,
        );
      }
      validPoliciesToApply.push({ type: p.type, version: p.version });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const p of validPoliciesToApply) {
        const now = new Date();
        await tx.userConsent.upsert({
          where: { userId_type: { userId, type: p.type } },
          create: {
            userId,
            type: p.type,
            version: p.version,
            status: ConsentStatus.GRANTED,
            consentedAt: now,
            revokedAt: null,
          },
          update: {
            version: p.version,
            status: ConsentStatus.GRANTED,
            consentedAt: now,
            revokedAt: null,
            updatedAt: now,
          },
        });

        await tx.userConsentHistory.create({
          data: {
            userId,
            type: p.type,
            version: p.version,
            action: 'GRANTED',
            ipAddress: peerIp ?? null,
            userAgent: userAgent ?? null,
          },
        });
      }
    });

    return this.getConsentStatus(userId);
  }

  async revokeConsent(
    operatorUserId: string,
    targetUserId: string,
    typeInput: unknown,
    peerIp?: string,
    userAgent?: string,
  ): Promise<{ message: string; type: string; status: string; revokedAt: Date }> {
    if (operatorUserId !== targetUserId) {
      throw new ForbiddenException(
        'Bạn không có quyền sửa hoặc thu hồi sự đồng ý của tài khoản khác.',
      );
    }

    if (typeof typeInput !== 'string') {
      throw new BadRequestException('Loại điều khoản cần thu hồi không hợp lệ.');
    }

    const type = typeInput.trim();
    const known = (
      Object.values(CURRENT_POLICIES) as Array<{
        type: string;
        version: string;
      }>
    ).find((def) => def.type === type);
    if (!known) {
      throw new BadRequestException(`Loại điều khoản '${type}' không hợp lệ.`);
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userConsent.findUnique({
        where: { userId_type: { userId: targetUserId, type } },
      });

      const version = existing?.version ?? known.version;

      const updated = await tx.userConsent.upsert({
        where: { userId_type: { userId: targetUserId, type } },
        create: {
          userId: targetUserId,
          type,
          version,
          status: ConsentStatus.REVOKED,
          consentedAt: now,
          revokedAt: now,
        },
        update: {
          status: ConsentStatus.REVOKED,
          revokedAt: now,
          updatedAt: now,
        },
      });

      await tx.userConsentHistory.create({
        data: {
          userId: targetUserId,
          type,
          version,
          action: 'REVOKED',
          ipAddress: peerIp ?? null,
          userAgent: userAgent ?? null,
        },
      });

      return updated;
    });

    return {
      message: `Đã thu hồi sự đồng ý cho ${known.type}.`,
      type: result.type,
      status: result.status,
      revokedAt: result.revokedAt!,
    };
  }

  async getConsentHistory(
    operatorUserId: string,
    targetUserId: string,
  ) {
    if (operatorUserId !== targetUserId) {
      throw new ForbiddenException(
        'Bạn không có quyền xem lịch sử đồng ý của tài khoản khác.',
      );
    }

    return this.prisma.userConsentHistory.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async canSendMarketingEmail(userIdOrEmail: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: userIdOrEmail.match(/^[0-9a-f-]{36}$/i) ? userIdOrEmail : undefined },
          { email: userIdOrEmail.toLowerCase().trim() },
        ],
      },
      select: { id: true },
    });

    if (!user) return false;

    const consent = await this.prisma.userConsent.findUnique({
      where: {
        userId_type: {
          userId: user.id,
          type: PolicyType.MARKETING_EMAIL,
        },
      },
    });

    return consent?.status === ConsentStatus.GRANTED;
  }

  async sendMarketingEmail(
    toEmail: string,
    subject: string,
    content: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    const allowed = await this.canSendMarketingEmail(toEmail);
    if (!allowed) {
      return {
        sent: false,
        reason: 'Người dùng chưa đồng ý hoặc đã thu hồi quyền nhận email tiếp thị.',
      };
    }

    if (this.mailService.ready) {
      await this.mailService.send({
        to: toEmail,
        subject,
        text: content,
        messageId: `mkt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      return { sent: true };
    }

    return { sent: true, reason: 'SIMULATED' };
  }
}
