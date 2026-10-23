import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WaitlistEntryStatus, WaitlistSignalStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WaitlistService {
  constructor(
    private readonly db: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  get workerEnabled() {
    return this.config.get<string>('WAITLIST_MAIL_WORKER') === 'true';
  }

  async current(showtimeId: string, userId: string) {
    const entry = await this.db.waitlistEntry.findFirst({
      where: { showtimeId, userId, status: { not: WaitlistEntryStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' },
    });
    if (!entry) return { entry: null };
    const [position] = await this.db.$queryRaw<{ position: number }[]>(Prisma.sql`
      SELECT count(*)::int AS position
      FROM waitlist_entries e
      WHERE e."showtimeId"=${showtimeId}::uuid
        AND e.status IN ('ACTIVE','NOTICE_QUEUED')
        AND (e."createdAt",e.id) <= (${entry.createdAt},${entry.id}::uuid)`);
    return { entry: { ...entry, position: position?.position ?? null } };
  }

  async join(showtimeId: string, userId: string) {
    try {
      return await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM showtimes WHERE id=${showtimeId}::uuid FOR SHARE`;
      const showtime = await tx.showtime.findUnique({
        where: { id: showtimeId },
        include: { event: { select: { status: true } } },
      });
      if (!showtime) throw new NotFoundException('Không tìm thấy suất diễn.');
      if (showtime.status !== 'ON_SALE' || showtime.isDemo || showtime.event.status !== 'PUBLISHED')
        throw new ConflictException('Suất diễn không nhận đăng ký chờ.');
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true, isEmailVerified: true },
      });
      if (!user?.isActive || !user.isEmailVerified)
        throw new BadRequestException('Tài khoản cần đang hoạt động và đã xác thực email.');

      const [availability] = await tx.$queryRaw<{ available: number }[]>(Prisma.sql`
        SELECT count(*)::int AS available
        FROM seats s
        WHERE s."showtimeId"=${showtimeId}::uuid AND s."isSold"=false
          AND NOT EXISTS(SELECT 1 FROM seat_holds h WHERE h."seatId"=s.id AND h."expiresAt">clock_timestamp())`);
      if ((availability?.available ?? 0) > 0)
        throw new ConflictException({ code: 'SEATS_AVAILABLE', message: 'Vẫn còn ghế mở bán; hãy chọn ghế trực tiếp.' });

      const existing = await tx.waitlistEntry.findFirst({
        where: {
          showtimeId,
          userId,
          status: { in: [WaitlistEntryStatus.ACTIVE, WaitlistEntryStatus.NOTICE_QUEUED, WaitlistEntryStatus.NOTIFIED] },
        },
      });
      if (existing) throw new ConflictException('Bạn đã có đăng ký chờ cho suất này.');
      const entry = await tx.waitlistEntry.create({
        data: { showtimeId, userId, status: WaitlistEntryStatus.ACTIVE },
      });
      const [position] = await tx.$queryRaw<{ position: number }[]>`SELECT count(*)::int AS position FROM waitlist_entries WHERE "showtimeId"=${showtimeId}::uuid AND status='ACTIVE' AND ("createdAt",id)<=(${entry.createdAt},${entry.id}::uuid)`;
      return { entry: { ...entry, position: position?.position ?? 1 } };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Bạn đã có đăng ký chờ cho suất này.');
      throw error;
    }
  }

  async unsubscribe(showtimeId: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const entry = await tx.waitlistEntry.findFirst({
        where: { showtimeId, userId, status: { not: WaitlistEntryStatus.CANCELLED } },
        orderBy: { createdAt: 'desc' },
      });
      if (!entry) throw new NotFoundException('Không tìm thấy đăng ký chờ.');
      await tx.waitlistNotification.updateMany({
        where: { entryId: entry.id, status: { in: ['QUEUED', 'SENDING'] } },
        data: { status: 'CANCELLED', leaseToken: null, leaseUntil: null, failureCode: 'UNSUBSCRIBED' },
      });
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: WaitlistEntryStatus.CANCELLED, cancelledAt: new Date() },
      });
      return { unsubscribed: true };
    });
  }

  async enqueueReleasedSeats(
    tx: Prisma.TransactionClient,
    showtimeId: string,
    releasedCount: number,
  ) {
    if (!Number.isInteger(releasedCount) || releasedCount <= 0) return null;
    return tx.waitlistAvailabilitySignal.create({
      data: { showtimeId, releasedCount, status: WaitlistSignalStatus.PENDING },
    });
  }

  /** Durable signal consumer. Each released seat is offered to one FIFO entry only. */
  async processSignalBatch() {
    const signalId = await this.db.$transaction(async (tx) => {
      const [signal] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM waitlist_availability_signals
        WHERE status='PENDING' ORDER BY "createdAt",id
        FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!signal) return null;
      const [scope] = await tx.$queryRaw<{ accepting: boolean; available: number }[]>`
        SELECT (s.status='ON_SALE' AND NOT s."isDemo" AND e.status='PUBLISHED') AS accepting,
          (SELECT count(*)::int FROM seats seat WHERE seat."showtimeId"=s.id AND NOT seat."isSold"
            AND NOT EXISTS(SELECT 1 FROM seat_holds h WHERE h."seatId"=seat.id AND h."expiresAt">clock_timestamp())) AS available
        FROM showtimes s JOIN events e ON e.id=s."eventId"
        WHERE s.id=(SELECT "showtimeId" FROM waitlist_availability_signals WHERE id=${signal.id}::uuid)`;
      const [showtime] = await tx.$queryRaw<{ showtimeId: string }[]>`
        SELECT "showtimeId" FROM waitlist_availability_signals WHERE id=${signal.id}::uuid`;
      if (!scope?.accepting) {
        await tx.waitlistAvailabilitySignal.update({ where: { id: signal.id }, data: { status: 'CANCELLED', processedAt: new Date() } });
        if (showtime) await tx.waitlistEntry.updateMany({
          where: { showtimeId: showtime.showtimeId, status: { in: ['ACTIVE','NOTICE_QUEUED','NOTIFIED'] } },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        return null;
      }
      const count = Math.min(scope.available, (await tx.waitlistAvailabilitySignal.findUniqueOrThrow({ where: { id: signal.id } })).releasedCount);
      const entries = count ? await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM waitlist_entries WHERE "showtimeId"=${showtime.showtimeId}::uuid AND status='ACTIVE'
        ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT ${count}`) : [];
      for (const entry of entries) {
        await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'NOTICE_QUEUED' } });
        await tx.waitlistNotification.create({ data: { entryId: entry.id, signalId: signal.id } });
      }
      await tx.waitlistAvailabilitySignal.update({ where: { id: signal.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
      return signal.id;
    });
    return signalId;
  }

  /** Claim/send one notice. The mail service accepts only the configured catcher in test profile. */
  async deliverNotification() {
    if (!this.mail.ready) return false;
    const lease = randomUUID();
    await this.db.$executeRaw`UPDATE waitlist_notifications SET status='FAILED',"failureCode"='LAST_ATTEMPT_INTERRUPTED',"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=now() WHERE status='SENDING' AND attempts>=3 AND "leaseUntil"<=now()`;
    const [notice] = await this.db.$queryRaw<{ id: string; entryId: string; attempts: number; leaseToken: string }[]>`
      WITH candidate AS (
        SELECT id FROM waitlist_notifications
        WHERE attempts<3 AND ((status='QUEUED' AND "nextAttemptAt"<=now()) OR (status='SENDING' AND "leaseUntil"<=now()))
        ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE waitlist_notifications n SET status='SENDING',attempts=n.attempts+1,"leaseToken"=${lease}::uuid,
        "leaseUntil"=now()+interval '60 seconds',"updatedAt"=now() FROM candidate WHERE n.id=candidate.id RETURNING n.*`;
    if (!notice) return false;
    try {
      const context = await this.db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ id: string; status: string; showtimeId: string; userId: string; email: string; isActive: boolean; isEmailVerified: boolean; eventName: string; startTime: Date }[]>`
          SELECT n.id,n.status,e."showtimeId",e."userId",u.email,u."isActive",u."isEmailVerified",ev.name AS "eventName",s."startTime"
          FROM waitlist_notifications n JOIN waitlist_entries e ON e.id=n."entryId" JOIN users u ON u.id=e."userId"
          JOIN showtimes s ON s.id=e."showtimeId" JOIN events ev ON ev.id=s."eventId"
          WHERE n.id=${notice.id}::uuid AND n."leaseToken"=${lease}::uuid AND n.status='SENDING' FOR UPDATE OF n,e,s,u`;
        if (!row || row.status !== 'SENDING') return null;
        const [open] = await tx.$queryRaw<{ count: number; accepting: boolean }[]>`
          SELECT (s.status='ON_SALE' AND NOT s."isDemo" AND ev.status='PUBLISHED' AND s."startTime">now()) AS accepting,
            (SELECT count(*)::int FROM seats seat WHERE seat."showtimeId"=s.id AND NOT seat."isSold"
             AND NOT EXISTS(SELECT 1 FROM seat_holds h WHERE h."seatId"=seat.id AND h."expiresAt">clock_timestamp())) AS count
          FROM showtimes s JOIN events ev ON ev.id=s."eventId" WHERE s.id=${row.showtimeId}::uuid`;
        if (!row.isActive || !row.isEmailVerified || !open?.accepting) {
          await tx.waitlistNotification.update({ where: { id: notice.id }, data: { status: 'CANCELLED', failureCode: 'RECIPIENT_OR_SHOW_UNAVAILABLE', leaseToken: null, leaseUntil: null } });
          await tx.waitlistEntry.update({ where: { id: notice.entryId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
          return null;
        }
        if (!open.count) {
          await tx.waitlistNotification.update({ where: { id: notice.id }, data: { status: 'CANCELLED', failureCode: 'SEATS_SOLD_BEFORE_NOTICE', leaseToken: null, leaseUntil: null } });
          await tx.waitlistEntry.update({ where: { id: notice.entryId }, data: { status: 'ACTIVE' } });
          return null;
        }
        return row;
      });
      if (!context) return true;
      // Availability can change after the transactional claim/validation and while
      // the worker is preparing the SMTP message. Re-read it at the last point
      // before invoking the mail transport, and suppress stale notices.
      if (!(await this.validateImmediatelyBeforeSend(notice.id, notice.entryId, lease, context.showtimeId)))
        return true;
      await this.mail.send({
        to: context.email,
        subject: `Ghế đã mở bán — ${context.eventName}`,
        messageId: `<waitlist-${notice.id}@codegym.local>`,
        text: `Một hoặc nhiều ghế cho ${context.eventName} đã mở bán. Bạn có thể quay lại trang sự kiện để chọn ghế. Thông báo này không giữ ghế; người khác có thể mua trước.`,
      });
      await this.db.$transaction(async (tx) => {
        const updated = await tx.waitlistNotification.updateMany({ where: { id: notice.id, status: 'SENDING', leaseToken: lease }, data: { status: 'SENT', sentAt: new Date(), failureCode: null, leaseToken: null, leaseUntil: null } });
        if (updated.count) await tx.waitlistEntry.updateMany({ where: { id: notice.entryId, status: 'NOTICE_QUEUED' }, data: { status: 'NOTIFIED', notifiedAt: new Date() } });
      });
      return true;
    } catch {
      await this.db.$executeRaw`UPDATE waitlist_notifications SET status=${notice.attempts>=3 ? 'FAILED' : 'QUEUED'},"failureCode"=${notice.attempts>=3 ? 'RETRY_EXHAUSTED' : 'DELIVERY_RETRY'},"nextAttemptAt"=now()+${notice.attempts===1 ? 5 : 15}*interval '1 second',"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=now() WHERE id=${notice.id}::uuid AND status='SENDING' AND "leaseToken"=${lease}::uuid`;
      if (notice.attempts >= 3) await this.db.waitlistEntry.updateMany({ where: { id: notice.entryId, status: 'NOTICE_QUEUED' }, data: { status: 'ACTIVE' } });
      return true;
    }
  }

  private async validateImmediatelyBeforeSend(
    noticeId: string,
    entryId: string,
    lease: string,
    showtimeId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const [state] = await tx.$queryRaw<{
        id: string;
        accepting: boolean;
        eligible: boolean;
        available: number;
      }[]>(Prisma.sql`
        SELECT n.id,
          (s.status='ON_SALE' AND NOT s."isDemo" AND ev.status='PUBLISHED' AND s."startTime">now()) AS accepting,
          (u."isActive" AND u."isEmailVerified" AND e.status='NOTICE_QUEUED') AS eligible,
          (SELECT count(*)::int FROM seats seat WHERE seat."showtimeId"=s.id AND NOT seat."isSold"
            AND NOT EXISTS(SELECT 1 FROM seat_holds h WHERE h."seatId"=seat.id AND h."expiresAt">clock_timestamp())) AS available
        FROM waitlist_notifications n
        JOIN waitlist_entries e ON e.id=n."entryId"
        JOIN users u ON u.id=e."userId"
        JOIN showtimes s ON s.id=e."showtimeId"
        JOIN events ev ON ev.id=s."eventId"
        WHERE n.id=${noticeId}::uuid AND e.id=${entryId}::uuid
          AND e."showtimeId"=${showtimeId}::uuid
          AND n.status='SENDING' AND n."leaseToken"=${lease}::uuid
        FOR UPDATE OF n`);
      if (!state) return false;
      if (!state.accepting || !state.eligible || state.available <= 0) {
        const soldOut = state.accepting && state.eligible && state.available <= 0;
        await tx.waitlistNotification.updateMany({
          where: { id: noticeId, status: 'SENDING', leaseToken: lease },
          data: {
            status: 'CANCELLED',
            failureCode: soldOut ? 'SEATS_SOLD_BEFORE_NOTICE' : 'NOTICE_NO_LONGER_ELIGIBLE',
            leaseToken: null,
            leaseUntil: null,
          },
        });
        await tx.waitlistEntry.updateMany({
          where: { id: entryId, status: 'NOTICE_QUEUED' },
          data: soldOut
            ? { status: 'ACTIVE' }
            : { status: 'CANCELLED', cancelledAt: new Date() },
        });
        return false;
      }
      return true;
    });
  }

  async drainOnce() {
    for (let i = 0; i < 100; i++) if (!(await this.processSignalBatch())) break;
    for (let i = 0; i < 100; i++) if (!(await this.deliverNotification())) break;
  }
}
