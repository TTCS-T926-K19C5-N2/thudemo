import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScannerCryptoService } from '../scanner/scanner-crypto.service.js';
type TicketRow = {
  id: string;
  showtimeId: string;
  seatId: string;
  eventName: string;
  showtimeStart: Date;
  checkedInAt: Date | null;
  row: string;
  seatNumber: number;
  categoryName: string;
  cancelled: boolean;
  used: boolean;
};
@Injectable()
export class TicketQrService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ScannerCryptoService,
  ) {}
  async forBuyer(
    userId: string,
    page: { page: number; pageSize: number; skip: number },
  ) {
    const [count] = await this.db.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT count(*)::int AS total FROM order_items oi JOIN orders o ON o.id=oi."orderId"
      JOIN tickets t ON t."orderId"=o.id AND t."seatId"=oi."seatId"
      WHERE o."userId"=${userId}::uuid AND o.status='PAID'::"OrderStatus"`);
    const ids = await this.db.$queryRaw<
      { ticketId: string; orderId: string }[]
    >(Prisma.sql`
      SELECT oi.id AS "ticketId",o.id AS "orderId" FROM order_items oi
      JOIN orders o ON o.id=oi."orderId" JOIN showtimes st ON st.id=o."showtimeId"
      JOIN tickets t ON t."orderId"=o.id AND t."seatId"=oi."seatId"
      WHERE o."userId"=${userId}::uuid AND o.status='PAID'::"OrderStatus"
      ORDER BY CASE WHEN st."startTime">=CURRENT_TIMESTAMP THEN 0 ELSE 1 END,
        CASE WHEN st."startTime">=CURRENT_TIMESTAMP THEN st."startTime" END ASC,
        CASE WHEN st."startTime"<CURRENT_TIMESTAMP THEN st."startTime" END DESC,oi.id
      LIMIT ${page.pageSize} OFFSET ${page.skip}`);
    // Bound the ticket ID page first; project each distinct owning order once.
    // No second QR encoder, ownership rule or issuance path is introduced.
    const projected = new Map<
      string,
      Awaited<ReturnType<TicketQrService['forOwner']>>['tickets'][number] & {
        orderId: string;
      }
    >();
    for (const orderId of new Set(ids.map((item) => item.orderId))) {
      for (const ticket of (await this.forOwner(orderId, userId)).tickets)
        projected.set(ticket.ticketId, { ...ticket, orderId });
    }
    return {
      tickets: ids
        .map((item) => projected.get(item.ticketId))
        .filter((t) => t !== undefined),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: count.total,
        hasNext: page.skip + ids.length < count.total,
      },
    };
  }
  async forOwner(orderId: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`
        SELECT status FROM orders WHERE id=${orderId}::uuid AND "userId"=${userId}::uuid FOR SHARE`);
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      if (order.status !== 'PAID')
        throw new ConflictException({
          code: 'TICKETS_NOT_READY',
          message: 'Vé chỉ sẵn sàng sau khi thanh toán được xác nhận.',
        });
      const items = await tx.$queryRaw<
        (TicketRow & {
          code: string | null;
          ticketDbId: string | null;
          transferredToEmail: string | null;
          ownerEmail: string | null;
        })[]
      >(Prisma.sql`
        SELECT oi.id,o."showtimeId",oi."seatId",oi."checkedInAt",s.row,s."seatNumber",oi."categoryName",
          e.name AS "eventName",st."startTime" AS "showtimeStart",
          EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CANCELLED') AS cancelled,
          EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CHECKED_IN') AS used,
          (SELECT t.code FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" LIMIT 1) AS code,
          (SELECT t.id::text FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" LIMIT 1) AS "ticketDbId",
          (SELECT t."transferredToEmail" FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" LIMIT 1) AS "transferredToEmail",
          (SELECT t."ownerEmail" FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" LIMIT 1) AS "ownerEmail"
        FROM order_items oi JOIN orders o ON o.id=oi."orderId" JOIN seats s ON s.id=oi."seatId"
          JOIN showtimes st ON st.id=o."showtimeId" JOIN events e ON e.id=st."eventId"
        WHERE o.id=${orderId}::uuid AND s."showtimeId"=o."showtimeId" ORDER BY s.row,s."seatNumber"`);
      if (items.some((item) => !item.ticketDbId || !item.code))
        throw new ConflictException({
          code: 'TICKETS_NOT_READY',
          message: 'Vé chưa được phát đầy đủ. Liên hệ hỗ trợ.',
        });
      return {
        tickets: items.map((item) => ({
          ticketId: item.id,
          id: item.ticketDbId ?? item.id,
          code: item.code ?? item.id,
          showtimeId: item.showtimeId,
          seatId: item.seatId,
          eventName: item.eventName,
          showtimeStart: item.showtimeStart.toISOString(),
          seatLabel: `${item.row}-${item.seatNumber}`,
          category: item.categoryName,
          ticketType: item.categoryName,
          status: item.cancelled
            ? ('CANCELLED' as const)
            : item.checkedInAt || item.used
              ? ('CHECKED_IN' as const)
              : ('VALID' as const),
          transferredToEmail: item.transferredToEmail ?? null,
          ownerEmail: item.ownerEmail ?? null,
          qrPayload: item.cancelled
            ? null
            : this.crypto.issueQr(item.id, item.showtimeId),
        })),
      };
    });
  }
}
