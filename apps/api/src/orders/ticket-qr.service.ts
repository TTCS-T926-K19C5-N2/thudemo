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
  eventName: string;
  startTime: Date;
  checkedInAt: Date | null;
  row: string;
  seatNumber: number;
  categoryName: string;
  tierName: string | null;
  cancelled: boolean;
  used: boolean;
};
@Injectable()
export class TicketQrService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ScannerCryptoService,
  ) {}
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
        SELECT oi.id,o."showtimeId",e.name AS "eventName",st."startTime",oi."checkedInAt",s.row,s."seatNumber",oi."categoryName",oi."tierName",
          EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CANCELLED') AS cancelled,
          EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CHECKED_IN') AS used,
          (SELECT t.code FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" LIMIT 1) AS code,
          (SELECT t.id::text FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" LIMIT 1) AS "ticketDbId",
          (SELECT t."transferredToEmail" FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" LIMIT 1) AS "transferredToEmail",
          (SELECT t."ownerEmail" FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" LIMIT 1) AS "ownerEmail"
        FROM order_items oi JOIN orders o ON o.id=oi."orderId" JOIN seats s ON s.id=oi."seatId"
          JOIN showtimes st ON st.id=o."showtimeId" JOIN events e ON e.id=st."eventId"
        WHERE o.id=${orderId}::uuid AND s."showtimeId"=o."showtimeId" ORDER BY s.row,s."seatNumber"`);
      return {
        tickets: items.map((item) => ({
          ticketId: item.id,
          id: item.ticketDbId ?? item.id,
          code: item.code ?? item.id,
          showtimeId: item.showtimeId,
          eventName: item.eventName,
          startTime: item.startTime.toISOString(),
          seatLabel: `${item.row}-${item.seatNumber}`,
          category: item.categoryName,
          tier: item.tierName,
          ticketType: item.categoryName,
          status: item.cancelled
            ? 'CANCELLED'
            : item.checkedInAt || item.used
              ? 'CHECKED_IN'
              : 'VALID',
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
