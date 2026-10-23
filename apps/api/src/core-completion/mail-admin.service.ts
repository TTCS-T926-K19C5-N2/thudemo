import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CoreService } from './core.service.js';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type MailRow = {
  id: string;
  kind: string;
  orderId: string;
  showtimeId: string;
  status: string;
  attempts: number;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};
@Injectable()
export class MailAdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly core: CoreService,
  ) {}
  async list(pageInput: unknown, statusInput: unknown, kindInput: unknown) {
    const page = pageInput === undefined ? 1 : Number(pageInput),
      status = statusInput ?? 'FAILED',
      kind = kindInput ?? 'ALL';
    if (
      typeof status !== 'string' || typeof kind !== 'string' ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      !['FAILED', 'QUEUED', 'SENDING', 'SENT', 'CANCELLED', 'ALL'].includes(
        String(status),
      ) ||
      !['TICKET', 'REMINDER', 'RESCHEDULED', 'ALL'].includes(String(kind))
    )
      throw new BadRequestException('Bộ lọc email không hợp lệ.');
    const union = Prisma.sql`SELECT m.id,'TICKET'::text AS kind,m."orderId",o."showtimeId",m.status,m.attempts,m."failureCode",m."createdAt",m."updatedAt" FROM ticket_mail_deliveries m JOIN orders o ON o.id=m."orderId" UNION ALL SELECT id,kind,"orderId","showtimeId",status,attempts,"failureCode","createdAt","updatedAt" FROM notification_mail`;
    const filter = Prisma.sql`(${status}='ALL' OR status=${status}) AND (${kind}='ALL' OR kind=${kind})`;
    const items = await this.db.$queryRaw<MailRow[]>(
      Prisma.sql`SELECT * FROM (${union}) m WHERE ${filter} ORDER BY "createdAt" DESC,id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
    );
    const [count] = await this.db.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT count(*)::int AS total FROM (${union}) m WHERE ${filter}`,
    );
    return {
      items,
      total: count.total,
      page,
      pageSize: 20,
      notificationWorkerEnabled: this.core.notificationEnabled,
      passwordResetWorkerEnabled: this.core.passwordWorkerEnabled,
    };
  }
  async retry(actor: string, input: unknown) {
    const b = input as {
      id?: unknown;
      kind?: unknown;
      requestId?: unknown;
    } | null;
    if (
      !b ||
      typeof b.id !== 'string' ||
      !uuid.test(b.id) ||
      typeof b.requestId !== 'string' ||
      !uuid.test(b.requestId) ||
      !['TICKET', 'REMINDER', 'RESCHEDULED'].includes(String(b.kind))
    )
      throw new BadRequestException('Yêu cầu gửi lại không hợp lệ.');
    const id = b.id,
      kind = String(b.kind),
      requestId = b.requestId;
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestId},0))`;
      const [prior] = await tx.$queryRaw<
        {
          actorId: string;
          sourceId: string;
          kind: string;
          deliveryId: string;
        }[]
      >`SELECT * FROM mail_retry_requests WHERE "requestId"=${requestId}::uuid`;
      if (prior) {
        if (
          prior.actorId !== actor ||
          prior.sourceId !== id ||
          prior.kind !== kind
        )
          throw new ConflictException('Mã yêu cầu đã dùng cho nội dung khác.');
        const replayTable = Prisma.raw(
          kind === 'TICKET' ? 'ticket_mail_deliveries' : 'notification_mail',
        );
        const [delivery] = await tx.$queryRaw<{ status: string }[]>(
          Prisma.sql`SELECT status FROM ${replayTable} WHERE id=${prior.deliveryId}::uuid`,
        );
        return {
          deliveryId: prior.deliveryId,
          replayed: true,
          status: delivery.status,
        };
      }
      const table = Prisma.raw(
        kind === 'TICKET' ? 'ticket_mail_deliveries' : 'notification_mail',
      );
      const [source] = await tx.$queryRaw<
        (MailRow & {
          recipientId?: string;
          version?: number;
          changeId?: string | null;
        })[]
      >(Prisma.sql`SELECT * FROM ${table} WHERE id=${id}::uuid`);
      if (!source) throw new NotFoundException('Không tìm thấy thư lỗi.');
      if (kind !== 'TICKET' && source.kind !== kind)
        throw new BadRequestException('Loại email không đúng.');
      const order = await tx.order.findUniqueOrThrow({
        where: { id: source.orderId },
        include: { user: true, showtime: true },
      });
      const recipient = source.recipientId ?? order.userId;
      await tx.$queryRaw`SELECT id FROM users WHERE id=${recipient}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM showtimes WHERE id=${order.showtimeId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${source.orderId}::uuid FOR UPDATE`;
      const [locked] = await tx.$queryRaw<{ status: string }[]>(
        Prisma.sql`SELECT status FROM ${table} WHERE id=${id}::uuid FOR UPDATE`,
      );
      const currentOrder = await tx.order.findUniqueOrThrow({
          where: { id: source.orderId },
        }),
        user = await tx.user.findUniqueOrThrow({ where: { id: recipient } });
      if (
        locked.status !== 'FAILED' ||
        currentOrder.status !== 'PAID' ||
        !user.isActive ||
        !user.isEmailVerified ||
        !(await tx.ticket.count({
          where: { orderId: source.orderId, status: 'VALID' },
        }))
      )
        throw new ConflictException(
          'Thư chưa thất bại hoặc đơn/vé/người nhận không còn hợp lệ.',
        );
      const [budget] = await tx.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM mail_retry_requests r JOIN (SELECT id,"orderId" FROM ticket_mail_deliveries UNION ALL SELECT id,"orderId" FROM notification_mail) m ON m.id=r."sourceId" WHERE m."orderId"=${source.orderId}::uuid AND r."createdAt">now()-interval '1 minute'`;
      if (budget.count >= 3)
        throw new ConflictException('Đã gửi lại nhiều lần; hãy chờ một phút.');
      const deliveryId = randomUUID();
      if (kind === 'TICKET') {
        const owned=await tx.ticket.count({where:{orderId:source.orderId,status:'VALID',OR:[{ownerEmail:null},{ownerEmail:{equals:user.email,mode:'insensitive'}}]}});
        if(!owned)throw new ConflictException('Người mua không còn sở hữu vé hợp lệ trong đơn; không gửi lại QR đã chuyển nhượng.');
        const [resends] = await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM ticket_mail_deliveries WHERE "orderId"=${source.orderId}::uuid AND "dedupeKey" LIKE 'resend:%' AND "createdAt">now()-interval '1 minute'`;
        if (resends.count >= 3)
          throw new ConflictException('Đã đạt giới hạn gửi lại của đơn.');
        await tx.ticketMailDelivery.create({
          data: {
            id: deliveryId,
            orderId: source.orderId,
            dedupeKey: `resend:admin:${requestId}`,
          },
        });
      } else {
        const [s] = await tx.$queryRaw<
          { scheduleVersion: number; startTime: Date; status: string }[]
        >`SELECT "scheduleVersion","startTime",status FROM showtimes WHERE id=${order.showtimeId}::uuid`;
        const owned = await tx.ticket.count({
          where: {
            orderId: source.orderId,
            status: 'VALID',
            OR: [
              { ownerEmail: { equals: user.email, mode: 'insensitive' } },
              ...(order.userId === recipient ? [{ ownerEmail: null }] : []),
            ],
          },
        });
        if (
          s.scheduleVersion !== source.version ||
          (await tx.showtimeCancellation.findUnique({
            where: { showtimeId: order.showtimeId },
          })) ||
          s.startTime <= new Date() ||
          !owned
        )
          throw new ConflictException(
            'Lịch diễn hoặc người sở hữu vé đã thay đổi; không gửi lại thông báo cũ.',
          );
        await tx.$executeRaw`INSERT INTO notification_mail(id,"orderId","recipientId","showtimeId",kind,version,"changeId","dedupeKey","parentId") VALUES (${deliveryId}::uuid,${source.orderId}::uuid,${recipient}::uuid,${order.showtimeId}::uuid,${kind},${source.version!},${source.changeId ?? null}::uuid,${`retry:${requestId}`},${id}::uuid)`;
      }
      await tx.$executeRaw`INSERT INTO mail_retry_requests("requestId","actorId","sourceId",kind,"deliveryId") VALUES (${requestId}::uuid,${actor}::uuid,${id}::uuid,${kind},${deliveryId}::uuid)`;
      await tx.domainAudit.create({
        data: {
          entityType: 'order',
          entityId: source.orderId,
          actorId: actor,
          actorType: 'USER',
          action: 'MAIL_RETRY_REQUESTED',
          beforeState: { deliveryId: id, status: 'FAILED' },
          afterState: { deliveryId, status: 'QUEUED', kind },
        },
      });
      return { deliveryId, status: 'QUEUED' };
    });
  }
}
