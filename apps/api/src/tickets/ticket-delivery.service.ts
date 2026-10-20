import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { TicketQrService } from '../orders/ticket-qr.service.js';
import { TICKET_MAIL_TRANSPORT } from './ticket-mail-transport.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
type Claim = {
  id: string;
  orderId: string;
  attempts: number;
  leaseToken: string;
};

@Injectable()
export class TicketDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private flight?: Promise<void>;
  constructor(
    private readonly db: PrismaService,
    private readonly projection: TicketQrService,
    @Inject(TICKET_MAIL_TRANSPORT) private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (
      this.config.get<string>('TICKET_MAIL_WORKER') !== 'true' ||
      !this.mail.ready
    )
      return;
    this.timer = setInterval(() => void this.drain(), 2000);
    this.timer.unref();
    void this.drain();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flight;
  }

  async resend(orderId: string, userId: string, value: unknown) {
    const requestId =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>).requestId
        : null;
    if (typeof requestId !== 'string' || !uuid.test(requestId))
      throw new BadRequestException('Mã yêu cầu gửi lại không hợp lệ.');
    // Ownership and paid/current-ticket eligibility precede cached idempotent result.
    const view = await this.projection.forOwner(orderId, userId);
    if (!view.tickets.some((t) => t.qrPayload))
      throw new BadRequestException('Đơn không còn vé hợp lệ để gửi.');
    if (
      !this.mail.ready ||
      this.config.get<string>('TICKET_MAIL_WORKER') !== 'true'
    )
      throw new ServiceUnavailableException({
        code: 'TICKET_MAIL_UNAVAILABLE',
        message:
          'Dịch vụ gửi vé chưa sẵn sàng. Vé vẫn xem được trên trang đơn.',
      });
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'ticket-mail:' + orderId},0))`,
      );
      const key = `resend:${userId}:${requestId.toLowerCase()}`;
      const prior = await tx.ticketMailDelivery.findUnique({
        where: { dedupeKey: key },
      });
      if (prior) {
        if (prior.orderId !== orderId)
          throw new BadRequestException(
            'Mã yêu cầu đã được dùng cho đơn khác.',
          );
        return { deliveryId: prior.id, status: prior.status };
      }
      const [budget] = await tx.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM ticket_mail_deliveries WHERE "orderId"=${orderId}::uuid
        AND "dedupeKey" LIKE 'resend:%' AND "createdAt">clock_timestamp()-interval '1 minute'`);
      if (budget.count >= 3)
        throw new HttpException(
          'Bạn đã gửi lại nhiều lần. Vui lòng chờ một phút.',
          429,
        );
      const delivery = await tx.ticketMailDelivery.create({
        data: { orderId, dedupeKey: key },
      });
      return { deliveryId: delivery.id, status: delivery.status };
    });
  }
  async failures() {
    return this.db.ticketMailDelivery.findMany({
      where: { status: 'FAILED' },
      select: {
        id: true,
        orderId: true,
        attempts: true,
        failureCode: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  }
  async drain(): Promise<void> {
    if (!this.mail.ready) return;
    if (this.flight) return this.flight;
    this.flight = this.deliverBatch()
      .catch(() => {
        this.logger.warn('Ticket mail work deferred; dependency unavailable');
      })
      .finally(() => {
        this.flight = undefined;
      });
    return this.flight;
  }
  private async deliverBatch() {
    await this.db.$executeRaw(
      Prisma.sql`UPDATE ticket_mail_deliveries SET status='FAILED',"failureCode"='LAST_ATTEMPT_INTERRUPTED',"leaseUntil"=NULL,"leaseToken"=NULL,"updatedAt"=clock_timestamp() WHERE status='SENDING' AND attempts>=3 AND "leaseUntil"<=clock_timestamp()`,
    );
    for (let i = 0; i < 5; i++) {
      const leaseToken = randomUUID();
      const claims = await this.db.$queryRaw<Claim[]>(Prisma.sql`
        WITH candidate AS (SELECT id FROM ticket_mail_deliveries WHERE attempts<3 AND
          ((status='QUEUED' AND "nextAttemptAt"<=clock_timestamp()) OR (status='SENDING' AND "leaseUntil"<=clock_timestamp()))
          ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE ticket_mail_deliveries d SET status='SENDING',attempts=d.attempts+1,"leaseToken"=${leaseToken}::uuid,
          "leaseUntil"=clock_timestamp()+interval '60 seconds',"updatedAt"=clock_timestamp()
        FROM candidate c WHERE d.id=c.id RETURNING d.id,d."orderId",d.attempts,d."leaseToken"`);
      if (!claims.length) return;
      const job = claims[0],
        where = { id: job.id, leaseToken: job.leaseToken, status: 'SENDING' };
      try {
        const order = await this.db.order.findUnique({
          where: { id: job.orderId },
          select: {
            userId: true,
            status: true,
            user: { select: { email: true } },
          },
        });
        if (!order || order.status !== 'PAID') {
          await this.db.ticketMailDelivery.updateMany({
            where,
            data: {
              status: 'CANCELLED',
              leaseToken: null,
              leaseUntil: null,
              failureCode: 'ORDER_NOT_PAID',
            },
          });
          continue;
        }
        const view = await this.projection.forOwner(job.orderId, order.userId);
        const tickets = view.tickets.filter(
          (t): t is typeof t & { qrPayload: string } =>
            !!t.qrPayload && t.status !== 'CANCELLED',
        );
        if (!tickets.length) {
          await this.db.ticketMailDelivery.updateMany({
            where,
            data: {
              status: 'CANCELLED',
              leaseToken: null,
              leaseUntil: null,
              failureCode: 'NO_VALID_TICKETS',
            },
          });
          continue;
        }
        const attachments = await Promise.all(
          tickets.map(async (t) => ({
            filename: `ve-${t.ticketId}.png`,
            content: await QRCode.toBuffer(t.qrPayload, {
              width: 512,
              margin: 4,
              errorCorrectionLevel: 'M',
            }),
            contentType: 'image/png' as const,
            cid: `qr-${t.ticketId}`,
          })),
        );
        const first = tickets[0],
          when = new Date(first.showtimeStart).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
          });
        await this.mail.send({
          to: order.user.email,
          subject: `Vé điện tử — ${first.eventName}`,
          messageId: `<ticket-${job.id}@thudemo.local>`,
          text: [
            first.eventName,
            when,
            ...tickets.map(
              (t) => `${t.category} · ${t.seatLabel} · ${t.ticketId}`,
            ),
          ].join('\n'),
          html: `<h1>${escape(first.eventName)}</h1><p>${escape(when)}</p>${tickets.map((t) => `<section><p>${escape(t.category)} · ${escape(t.seatLabel)}</p><img src="cid:qr-${t.ticketId}" alt="QR vé ${escape(t.seatLabel)}" width="320" height="320"></section>`).join('')}`,
          attachments,
        });
        await this.db.ticketMailDelivery.updateMany({
          where,
          data: {
            status: 'SENT',
            sentAt: new Date(),
            failureCode: null,
            leaseUntil: null,
            leaseToken: null,
            updatedAt: new Date(),
          },
        });
      } catch {
        await this.db.ticketMailDelivery.updateMany({
          where,
          data: {
            status: job.attempts >= 3 ? 'FAILED' : 'QUEUED',
            failureCode:
              job.attempts >= 3 ? 'RETRY_EXHAUSTED' : 'DELIVERY_RETRY',
            nextAttemptAt: new Date(
              Date.now() + (job.attempts === 1 ? 5000 : 15000),
            ),
            leaseUntil: null,
            leaseToken: null,
            updatedAt: new Date(),
          },
        });
        this.logger.warn(
          JSON.stringify({
            event: 'ticket_mail_retry',
            deliveryId: job.id,
            attempts: job.attempts,
            terminal: job.attempts >= 3,
          }),
        );
      }
    }
  }
}
