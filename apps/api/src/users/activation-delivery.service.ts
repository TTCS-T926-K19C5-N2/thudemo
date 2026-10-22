import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { RegistrationSettings } from './registration-settings.js';
import { REGISTRATION_NOTICE } from 'shared/registration-notice';

export function activationHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function encryptActivation(token: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(activationHash(token)));
  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    'base64url',
  );
}

function decryptActivation(value: string, hash: string, key: Buffer): string {
  const data = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  cipher.setAAD(Buffer.from(hash));
  const token = Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString('utf8');
  if (activationHash(token) !== hash)
    throw new Error('Invalid delivery record');
  return token;
}

@Injectable()
export class ActivationDeliveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ActivationDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private flight?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly settings: RegistrationSettings,
  ) {}

  get available(): boolean {
    return (
      !!this.settings.encryptionKey &&
      !!this.settings.publicOrigin &&
      this.mail.ready
    );
  }

  onModuleInit() {
    if (!this.available || !this.settings.worker) return;
    this.timer = setInterval(() => void this.drain(), 2000);
    this.timer.unref();
    void this.drain();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flight;
  }

  async drain(): Promise<void> {
    if (!this.available) return;
    if (this.flight) return this.flight;
    this.flight = this.deliverBatch()
      .catch(() => {
        // Never log provider errors: they can contain recipient/auth/body data.
        this.logger.warn(
          'Activation delivery deferred; dependency unavailable',
        );
      })
      .finally(() => {
        this.flight = undefined;
      });
    return this.flight;
  }

  private async deliverBatch() {
    // A crash on the final attempt must not leave an unrecoverable lease.
    await this.prisma.$executeRaw`
      UPDATE activation_mail SET status='FAILED', "leaseUntil"=NULL,
        "encryptedToken"='', "updatedAt"=clock_timestamp()
      WHERE status='SENDING' AND attempts>=5 AND "leaseUntil"<=clock_timestamp()`;
    for (let i = 0; i < 5; i++) {
      const claims = await this.prisma.$queryRaw<
        Array<{ id: string; attempts: number }>
      >`
        WITH candidate AS (
          SELECT id FROM activation_mail
          WHERE ((status='QUEUED' AND "nextAttemptAt"<=clock_timestamp())
            OR (status='SENDING' AND "leaseUntil"<=clock_timestamp()))
            AND attempts<5
          ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE activation_mail AS m
          SET status='SENDING', attempts=m.attempts+1,
              "leaseUntil"=clock_timestamp()+interval '30 seconds',
              "updatedAt"=clock_timestamp()
          FROM candidate WHERE m.id=candidate.id RETURNING m.id,m.attempts`;
      if (!claims.length) return;
      const claim = claims[0];
      const where = {
        id: claim.id,
        attempts: claim.attempts,
        status: 'SENDING',
      };
      const record = await this.prisma.activationMail.findUniqueOrThrow({
        where: { id: claim.id },
        include: { token: { include: { user: true } } },
      });
      try {
        if (
          record.token.consumedAt ||
          record.token.expiresAt.getTime() <= Date.now() ||
          record.token.user.isEmailVerified ||
          !record.token.user.isActive
        ) {
          await this.prisma.activationMail.updateMany({
            where,
            data: { status: 'CANCELLED', encryptedToken: '', leaseUntil: null },
          });
          continue;
        }
        const token = decryptActivation(
          record.encryptedToken,
          record.tokenHash,
          this.settings.encryptionKey!,
        );
        // A fragment is never sent as the browser's request URL/referrer.
        const link = `${this.settings.publicOrigin}/activate#token=${token}`;
        await this.mail.send({
          to: record.token.user.email,
          subject: 'Kích hoạt tài khoản thử nghiệm',
          messageId: `<activation-${record.id}@sprint1.demo.invalid>`,
          text: [
            'Bạn đã yêu cầu tạo tài khoản thử nghiệm cho bản demo nội bộ.',
            `Kích hoạt tài khoản (liên kết dùng một lần, hạn 24 giờ): ${link}`,
            'Nếu bạn không yêu cầu, hãy bỏ qua thư này.',
            `Thông báo xử lý dữ liệu: ${this.settings.publicOrigin}/privacy`,
            `Phiên bản: ${REGISTRATION_NOTICE.version}. Thư này không dùng cho tiếp thị.`,
            `Yêu cầu rút lại đồng ý: ${REGISTRATION_NOTICE.withdrawalEmail}`,
          ].join('\n\n'),
        });
        await this.prisma.activationMail.updateMany({
          where,
          data: {
            status: 'SENT',
            sentAt: new Date(),
            leaseUntil: null,
            encryptedToken: '',
          },
        });
      } catch {
        await this.prisma.activationMail.updateMany({
          where,
          data: {
            status: claim.attempts >= 5 ? 'FAILED' : 'QUEUED',
            ...(claim.attempts >= 5 ? { encryptedToken: '' } : {}),
            nextAttemptAt: new Date(Date.now() + 30_000 * claim.attempts),
            leaseUntil: null,
          },
        });
        this.logger.warn('Activation email deferred; retry scheduled');
      }
    }
  }
}
