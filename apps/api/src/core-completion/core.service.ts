import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Redis } from 'ioredis';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { RegistrationSettings } from '../users/registration-settings.js';
import {
  activationHash,
  encryptActivation,
  decryptActivation,
} from '../users/activation-delivery.service.js';
import { ScannerCryptoService } from '../scanner/scanner-crypto.service.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const GENERIC_RESET = {
  message: 'Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
};
type Tx = Prisma.TransactionClient;
type Job = {
  id: string;
  orderId: string;
  recipientId: string;
  showtimeId: string;
  kind: string;
  version: number;
  changeId: string | null;
  attempts: number;
  leaseToken: string;
  status: string;
};
type Reset = {
  tokenHash: string;
  userId: string;
  encryptedToken: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  leaseToken: string;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function resetPasswordInput(
  token: unknown,
  password: unknown,
): asserts token is string {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    throw new BadRequestException(
      'Liên kết không hợp lệ, đã dùng hoặc hết hạn. Hãy yêu cầu lại.',
    );
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 1024
  )
    throw new BadRequestException('Mật khẩu phải từ 8 đến 1024 ký tự.');
}

@Injectable()
export class CoreService {
  constructor(
    private readonly db: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly settings: RegistrationSettings,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly crypto: ScannerCryptoService,
  ) {}
  get notificationEnabled() {
    return this.config.get<string>('NOTIFICATION_MAIL_WORKER') === 'true';
  }
  get passwordWorkerEnabled() {
    return (
      this.config.get<string>('PASSWORD_RESET_WORKER') === 'true' &&
      this.settings.worker
    );
  }
  private async audit(
    tx: Tx,
    actor: string,
    entityType: string,
    entityId: string,
    action: string,
    beforeState: Prisma.InputJsonValue,
    afterState: Prisma.InputJsonValue,
  ) {
    await tx.domainAudit.create({
      data: {
        actorId: actor,
        actorType: 'USER',
        entityType,
        entityId,
        action,
        beforeState,
        afterState,
      },
    });
  }
  private async enqueue(
    tx: Tx,
    showtimeId: string,
    kind: 'REMINDER' | 'RESCHEDULED',
    version: number,
    changeId: string | null,
  ) {
    // Resolve current ownership to a verified account. Never persist recipient email in jobs.
    const groups = await tx.$queryRaw<
      { orderId: string; recipientId: string }[]
    >`SELECT DISTINCT COALESCE(t."orderId", orig."orderId") AS "orderId", r.id AS "recipientId"
      FROM tickets t
      LEFT JOIN orders o ON o.id = t."orderId"
      LEFT JOIN ticket_logs tl ON tl."ticketId" = t.id AND tl.action = 'ISSUED_FROM_TRANSFER'
      LEFT JOIN tickets orig ON orig.id = (tl.detail->>'fromTicketId')::uuid
      LEFT JOIN orders orig_o ON orig_o.id = orig."orderId"
      LEFT JOIN users buyer ON buyer.id = COALESCE(o."userId", orig_o."userId")
      JOIN users r ON lower(r.email) = lower(COALESCE(t."ownerEmail", buyer.email))
      WHERE t."showtimeId" = ${showtimeId}::uuid
        AND t.status = 'VALID'
        AND (o.status = 'PAID' OR orig_o.status = 'PAID')
        AND r."isActive" = true
        AND r."isEmailVerified" = true`;
    for (const g of groups) {
      if (!g.orderId) continue;
      const key = `${kind}:${g.orderId}:${g.recipientId}:${version}`;
      await tx.$executeRaw`INSERT INTO notification_mail(id,"orderId","recipientId","showtimeId",kind,version,"changeId","dedupeKey") VALUES (${randomUUID()}::uuid,${g.orderId}::uuid,${g.recipientId}::uuid,${showtimeId}::uuid,${kind},${version},${changeId}::uuid,${key}) ON CONFLICT("dedupeKey") DO NOTHING`;
    }
    return groups.length;
  }
  async reschedule(id: string, actor: string, input: unknown) {
    const body = input as {
      startTime?: unknown;
      reason?: unknown;
      requestId?: unknown;
    } | null;
    if (
      !uuid.test(id) ||
      !body ||
      typeof body.requestId !== 'string' ||
      !uuid.test(body.requestId) ||
      typeof body.startTime !== 'string' ||
      !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(body.startTime) ||
      !Number.isFinite(Date.parse(body.startTime)) ||
      typeof body.reason !== 'string' ||
      body.reason.trim().length < 3 ||
      body.reason.trim().length > 1000
    )
      throw new BadRequestException(
        'Nhập giờ ISO có múi giờ, lý do 3–1000 ký tự và mã yêu cầu hợp lệ.',
      );
    const start = new Date(body.startTime),
      reason = body.reason.trim(),
      requestId = body.requestId;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM showtimes WHERE id=${id}::uuid FOR UPDATE`;
      const s = await tx.showtime.findUnique({
        where: { id },
        include: { event: true },
      });
      if (!s) throw new NotFoundException('Không tìm thấy suất.');
      if (s.event.organizerId !== actor)
        throw new ForbiddenException('Bạn không sở hữu suất.');
      const prior = await tx.$queryRaw<
        { showtimeId: string; newTime: Date; reason: string; id: string }[]
      >`SELECT * FROM schedule_changes WHERE "requestId"=${requestId}::uuid`;
      if (prior[0]) {
        if (
          prior[0].showtimeId !== id ||
          prior[0].newTime.getTime() !== start.getTime() ||
          prior[0].reason !== reason
        )
          throw new ConflictException('Mã yêu cầu đã dùng cho nội dung khác.');
        return {
          changeId: prior[0].id,
          startTime: start.toISOString(),
          notificationStatus: 'QUEUED',
          replayed: true,
        };
      }
      if (
        s.startTime <= new Date() ||
        start <= new Date() ||
        s.startTime.getTime() === start.getTime() ||
        (await tx.showtimeCancellation.findUnique({
          where: { showtimeId: id },
        })) ||
        (await tx.ticketAdmission.count({ where: { showtimeId: id } }))
      )
        throw new ConflictException(
          'Không đổi giờ suất đã huỷ, đã bắt đầu, đã có lượt vào hoặc giờ mới không hợp lệ.',
        );
      const [revision] = await tx.$queryRaw<
        { scheduleVersion: number }[]
      >`UPDATE showtimes SET "startTime"=${start},"scheduleVersion"="scheduleVersion"+1,"updatedAt"=now() WHERE id=${id}::uuid RETURNING "scheduleVersion"`;
      const changeId = randomUUID();
      await tx.$executeRaw`INSERT INTO schedule_changes(id,"showtimeId","actorId","requestId","oldTime","newTime",reason,version) VALUES (${changeId}::uuid,${id}::uuid,${actor}::uuid,${requestId}::uuid,${s.startTime},${start},${reason},${revision.scheduleVersion})`;
      await tx.$executeRaw`UPDATE notification_mail SET status='CANCELLED',"failureCode"='SCHEDULE_CHANGED',"updatedAt"=now() WHERE "showtimeId"=${id}::uuid AND status IN ('QUEUED','FAILED','SENDING')`;
      const queued = await this.enqueue(
        tx,
        id,
        'RESCHEDULED',
        revision.scheduleVersion,
        changeId,
      );
      await tx.catalogRevision.update({
        where: { id: 1 },
        data: { version: { increment: 1 } },
      });
      await this.audit(
        tx,
        actor,
        'showtime',
        id,
        'SHOWTIME_RESCHEDULED',
        { startTime: s.startTime.toISOString() },
        {
          startTime: start.toISOString(),
          reason,
          version: revision.scheduleVersion,
        },
      );
      return {
        changeId,
        startTime: start.toISOString(),
        queued,
        notificationStatus: 'QUEUED',
        workerEnabled: this.notificationEnabled,
      };
    });
  }
  async enqueueReminders() {
    if (!this.notificationEnabled) return;
    const shows = await this.db.$queryRaw<
      { id: string; scheduleVersion: number }[]
    >`SELECT s.id,s."scheduleVersion" FROM showtimes s WHERE s."startTime">now() AND s."startTime"<=now()+interval '24 hours' AND s.status IN ('ON_SALE','CLOSED') AND NOT EXISTS(SELECT 1 FROM showtime_cancellations c WHERE c."showtimeId"=s.id)`;
    for (const s of shows)
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM showtimes WHERE id=${s.id}::uuid FOR UPDATE`;
        await this.enqueue(tx, s.id, 'REMINDER', s.scheduleVersion, null);
      });
  }
  async deliverNotification() {
    if (!this.mail.ready) return;
    const lease = randomUUID();
    await this.db
      .$executeRaw`UPDATE notification_mail SET status='FAILED',"failureCode"='LAST_ATTEMPT_INTERRUPTED',"leaseUntil"=NULL,"leaseToken"=NULL WHERE status='SENDING' AND attempts>=3 AND "leaseUntil"<=now()`;
    const [job] = await this.db.$queryRaw<
      Job[]
    >`WITH candidate AS (SELECT id FROM notification_mail WHERE attempts<3 AND ((status='QUEUED' AND "nextAttemptAt"<=now()) OR (status='SENDING' AND "leaseUntil"<=now())) ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE notification_mail m SET status='SENDING',attempts=m.attempts+1,"leaseToken"=${lease}::uuid,"leaseUntil"=now()+interval '60 seconds',"updatedAt"=now() FROM candidate WHERE m.id=candidate.id RETURNING m.*`;
    if (!job) return;
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id=${job.recipientId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM showtimes WHERE id=${job.showtimeId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM orders WHERE id=${job.orderId}::uuid FOR UPDATE`;
          const [current] = await tx.$queryRaw<
            Job[]
          >`SELECT * FROM notification_mail WHERE id=${job.id}::uuid AND "leaseToken"=${lease}::uuid AND status='SENDING' FOR UPDATE`;
          if (!current) return;
          const user = await tx.user.findUnique({
              where: { id: job.recipientId },
            }),
            order = await tx.order.findUnique({
              where: { id: job.orderId },
              include: { user: true },
            }),
            show = await tx.showtime.findUnique({
              where: { id: job.showtimeId },
              include: { event: true },
            });
          const [version] = await tx.$queryRaw<
            { scheduleVersion: number }[]
          >`SELECT "scheduleVersion" FROM showtimes WHERE id=${job.showtimeId}::uuid`;
          const valid =
            user?.isActive &&
            user.isEmailVerified &&
            order?.status === 'PAID' &&
            show &&
            show.startTime > new Date() &&
            version.scheduleVersion === job.version &&
            !(await tx.showtimeCancellation.findUnique({
              where: { showtimeId: job.showtimeId },
            }));
          const tickets = valid
            ? await tx.ticket.findMany({
                where: {
                  showtimeId: job.showtimeId,
                  status: 'VALID',
                  OR: [
                    { orderId: job.orderId },
                    {
                      orderId: null,
                      ownerEmail: user!.email,
                      logs: { some: { action: 'ISSUED_FROM_TRANSFER' } },
                    },
                  ],
                },
              })
            : [];
          const owned = tickets.filter(
            (t) =>
              (t.ownerEmail ?? order!.user.email).toLowerCase() ===
              user!.email.toLowerCase(),
          );
          if (!valid || !owned.length) {
            await tx.$executeRaw`UPDATE notification_mail SET status='CANCELLED',"failureCode"='RECIPIENT_OR_TICKET_UNAVAILABLE',"leaseToken"=NULL,"leaseUntil"=NULL WHERE id=${job.id}::uuid`;
            return;
          }
          const items = await tx.orderItem.findMany({
            where: { orderId: job.orderId },
          });
          const attachments = await Promise.all(
            owned.map(async (t) => {
              const item = items.find((i) => i.seatId === t.seatId);
              const qrPayload = t.code
                ? this.crypto.issueQr(t.code, t.showtimeId)
                : item
                  ? this.crypto.issueQr(item.id, t.showtimeId)
                  : '';
              return {
                filename: `ve-${t.id}.png`,
                cid: `qr-${t.id}`,
                content: await QRCode.toBuffer(
                  qrPayload,
                  { width: 512, margin: 4 },
                ),
                contentType: 'image/png' as const,
              };
            }),
          );
          const [change] = job.changeId
            ? await tx.$queryRaw<
                { oldTime: Date; reason: string }[]
              >`SELECT "oldTime",reason FROM schedule_changes WHERE id=${job.changeId}::uuid`
            : [];
          const when = show!.startTime.toLocaleString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
            }),
            title =
              job.kind === 'REMINDER'
                ? 'Nhắc lịch diễn'
                : 'Thông báo đổi giờ diễn';
          const lines = [
            title,
            show!.event.name,
            `Giờ diễn: ${when} (giờ Việt Nam)`,
            show!.event.location,
            ...(change
              ? [
                  `Giờ cũ: ${change.oldTime.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
                  `Lý do: ${change.reason}`,
                ]
              : []),
            ...owned.map((t) => t.seatLabel ?? 'Vé'),
          ];
          await this.mail.send({
            to: user!.email,
            subject: `${title} — ${show!.event.name}`,
            messageId: `<notification-${job.id}@codegym.local>`,
            text: lines.join('\n'),
            html:
              lines.map((l) => `<p>${escape(l)}</p>`).join('') +
              owned
                .map(
                  (t) =>
                    `<img src="cid:qr-${t.id}" width="320" height="320" alt="QR vé"/>`,
                )
                .join(''),
            attachments,
          });
          await tx.$executeRaw`UPDATE notification_mail SET status='SENT',"sentAt"=now(),"failureCode"=NULL,"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=now() WHERE id=${job.id}::uuid AND "leaseToken"=${lease}::uuid`;
        },
        { timeout: 25000 },
      );
    } catch {
      await this.db
        .$executeRaw`UPDATE notification_mail SET status=${job.attempts >= 3 ? 'FAILED' : 'QUEUED'},"failureCode"=${job.attempts >= 3 ? 'RETRY_EXHAUSTED' : 'DELIVERY_RETRY'},"nextAttemptAt"=now()+${job.attempts === 1 ? 5 : 15}*interval '1 second',"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=now() WHERE id=${job.id}::uuid AND status='SENDING' AND "leaseToken"=${lease}::uuid`;
    }
  }
  async forgot(emailInput: unknown, peer: string) {
    const email =
      typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
    if (email.length > 320 || !/^\S+@[^\s@]+\.[^\s@]+$/.test(email))
      return GENERIC_RESET;
    if (
      !this.settings.encryptionKey ||
      !this.settings.publicOrigin ||
      !this.mail.ready
    )
      throw new ServiceUnavailableException(
        'Đặt lại mật khẩu tạm thời chưa sẵn sàng.',
      );
    const digest = (s: string) => createHash('sha256').update(s).digest('hex');
    const rate = Number(
      await this.redis.eval(
        "local a=redis.call('INCR',KEYS[1]);if a==1 then redis.call('EXPIRE',KEYS[1],900) end;local b=redis.call('INCR',KEYS[2]);if b==1 then redis.call('EXPIRE',KEYS[2],900) end;if a>3 or b>20 then return 1 end;return 0",
        2,
        `auth:reset:email:${digest(email)}`,
        `auth:reset:ip:${digest(peer)}`,
      ),
    );
    if (rate)
      throw new HttpException(
        'Yêu cầu quá nhiều. Hãy thử lại sau 15 phút.',
        429,
      );
    const users = await this.db.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      take: 2,
    });
    if (users.length !== 1 || !users[0].isActive || !users[0].isEmailVerified)
      return GENERIC_RESET;
    const user = users[0],
      token = randomBytes(32).toString('hex'),
      hash = activationHash(token),
      encrypted = encryptActivation(token, this.settings.encryptionKey);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      if (!current.isActive || !current.isEmailVerified) return;
      await tx.$executeRaw`UPDATE password_resets SET "consumedAt"=now(),status='CANCELLED',"encryptedToken"='' WHERE "userId"=${user.id}::uuid AND "consumedAt" IS NULL`;
      await tx.$executeRaw`INSERT INTO password_resets("tokenHash","userId","encryptedToken","expiresAt") VALUES (${hash},${user.id}::uuid,${encrypted},now()+interval '15 minutes')`;
    });
    return GENERIC_RESET;
  }
  async reset(token: unknown, passwordInput: unknown, peer?: string) {
    resetPasswordInput(token, passwordInput);
    if (peer) {
      const key =
        'auth:reset-submit:ip:' +
        createHash('sha256').update(peer).digest('hex');
      const count = Number(
        await this.redis.eval(
          "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],900) end;return n",
          1,
          key,
        ),
      );
      if (count > 20)
        throw new HttpException(
          'Yêu cầu quá nhiều. Hãy thử lại sau 15 phút.',
          429,
        );
    }
    const hash = activationHash(token),
      password = await argon2.hash(passwordInput as string, {
        type: argon2.argon2id,
      });
    const user = await this.db.$transaction(async (tx) => {
      const [candidate] = await tx.$queryRaw<
        Reset[]
      >`SELECT * FROM password_resets WHERE "tokenHash"=${hash}`;
      if (!candidate)
        throw new BadRequestException(
          'Liên kết không hợp lệ, đã dùng hoặc hết hạn. Hãy yêu cầu lại.',
        );
      await tx.$queryRaw`SELECT id FROM users WHERE id=${candidate.userId}::uuid FOR UPDATE`;
      const [row] = await tx.$queryRaw<
        Reset[]
      >`SELECT * FROM password_resets WHERE "tokenHash"=${hash} AND "consumedAt" IS NULL AND "expiresAt">clock_timestamp() FOR UPDATE`;
      const account = await tx.user.findUniqueOrThrow({
        where: { id: candidate.userId },
      });
      if (!row || !account.isActive || !account.isEmailVerified)
        throw new BadRequestException(
          'Liên kết không hợp lệ, đã dùng hoặc hết hạn. Hãy yêu cầu lại.',
        );
      await tx.user.update({ where: { id: account.id }, data: { password } });
      await tx.session.deleteMany({ where: { userId: account.id } });
      await tx.$executeRaw`UPDATE password_resets SET "consumedAt"=now(),status='CANCELLED',"encryptedToken"='' WHERE "userId"=${account.id}::uuid AND "consumedAt" IS NULL`;
      return account;
    });
    const digest = createHash('sha256')
      .update(user.email.trim().toLowerCase())
      .digest('hex');
    await this.redis.del(`auth:fail:${digest}`, `auth:lock:${digest}`);
    return { message: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.' };
  }
  async deliverReset() {
    if (
      !this.mail.ready ||
      !this.settings.encryptionKey ||
      !this.settings.publicOrigin
    )
      return;
    await this.db
      .$executeRaw`UPDATE password_resets SET status='CANCELLED',"encryptedToken"='',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "expiresAt"<=now() AND status IN ('QUEUED','FAILED','SENDING')`;
    const lease = randomUUID();
    await this.db
      .$executeRaw`UPDATE password_resets SET status='FAILED',"encryptedToken"='' WHERE status='SENDING' AND attempts>=3 AND "leaseUntil"<=now()`;
    const [job] = await this.db.$queryRaw<
      Reset[]
    >`WITH c AS (SELECT "tokenHash" FROM password_resets WHERE "consumedAt" IS NULL AND "expiresAt">now() AND attempts<3 AND ((status='QUEUED' AND "nextAttemptAt"<=now()) OR (status='SENDING' AND "leaseUntil"<=now())) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE password_resets p SET status='SENDING',attempts=p.attempts+1,"leaseToken"=${lease}::uuid,"leaseUntil"=now()+interval '60 seconds' FROM c WHERE p."tokenHash"=c."tokenHash" RETURNING p.*`;
    if (!job) return;
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id=${job.userId}::uuid FOR UPDATE`;
          const [current] = await tx.$queryRaw<
            Reset[]
          >`SELECT * FROM password_resets WHERE "tokenHash"=${job.tokenHash} AND "leaseToken"=${lease}::uuid AND status='SENDING' AND "consumedAt" IS NULL AND "expiresAt">clock_timestamp() FOR UPDATE`;
          if (!current) return;
          const user = await tx.user.findUniqueOrThrow({
            where: { id: job.userId },
          });
          if (!user.isActive || !user.isEmailVerified) {
            await tx.$executeRaw`UPDATE password_resets SET status='CANCELLED',"encryptedToken"='' WHERE "tokenHash"=${job.tokenHash}`;
            return;
          }
          const token = decryptActivation(
            current.encryptedToken,
            current.tokenHash,
            this.settings.encryptionKey!,
          );
          // Fragment keeps the token out of HTTP access logs and referrer URLs.
          const link = `${this.settings.publicOrigin}/reset-password#token=${token}`;
          await this.mail.send({
            to: user.email,
            subject: 'Đặt lại mật khẩu Vé Sự Kiện',
            messageId: `<reset-${job.tokenHash.slice(0, 16)}@codegym.local>`,
            text: `Mở liên kết để đặt lại mật khẩu trong 15 phút:\n${link}\nNếu không yêu cầu, bạn có thể bỏ qua thư này.`,
          });
          await tx.$executeRaw`UPDATE password_resets SET status='SENT',"encryptedToken"='',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "tokenHash"=${job.tokenHash} AND "leaseToken"=${lease}::uuid`;
        },
        { timeout: 25000 },
      );
    } catch {
      await this.db
        .$executeRaw`UPDATE password_resets SET status=${job.attempts >= 3 ? 'FAILED' : 'QUEUED'},"nextAttemptAt"=now()+${job.attempts === 1 ? 5 : 15}*interval '1 second',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "tokenHash"=${job.tokenHash} AND status='SENDING' AND "leaseToken"=${lease}::uuid`;
    }
  }
}
