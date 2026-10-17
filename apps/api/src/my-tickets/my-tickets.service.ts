import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScannerCryptoService } from '../scanner/scanner-crypto.service.js';

type MyTicketRow = {
  id: string;
  showtimeId: string;
  startTime: Date;
  eventName: string;
  seatLabel: string;
  categoryName: string;
  cancelled: boolean;
  used: boolean;
};

@Injectable()
export class MyTicketsService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ScannerCryptoService,
  ) {}

  // Vé của người mua trên mọi suất. Suất chưa diễn xếp trước, suất đã qua xếp sau.
  async mineForOwner(userId: string, now = new Date()) {
    const rows = await this.db.$queryRaw<MyTicketRow[]>(Prisma.sql`
      SELECT oi.id, o."showtimeId", sh."startTime", e.name AS "eventName",
        s.row || '-' || s."seatNumber" AS "seatLabel", oi."categoryName",
        EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CANCELLED') AS cancelled,
        EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CHECKED_IN') AS used
      FROM orders o
        JOIN order_items oi ON oi."orderId"=o.id
        JOIN seats s ON s.id=oi."seatId"
        JOIN showtimes sh ON sh.id=o."showtimeId"
        JOIN events e ON e.id=sh."eventId"
      WHERE o."userId"=${userId}::uuid AND o.status='PAID' AND s."showtimeId"=o."showtimeId"`);

    const tickets = rows.map((item) => {
      const upcoming = item.startTime.getTime() >= now.getTime();
      return {
        ticketId: item.id,
        showtimeId: item.showtimeId,
        eventName: item.eventName,
        startTime: item.startTime.toISOString(),
        upcoming,
        seatLabel: item.seatLabel,
        category: item.categoryName,
        status: item.cancelled
          ? ('CANCELLED' as const)
          : item.used
            ? ('CHECKED_IN' as const)
            : ('VALID' as const),
        qrPayload: item.cancelled
          ? null
          : this.crypto.issueQr(item.id, item.showtimeId),
      };
    });

    tickets.sort((a, b) => {
      if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
      const diff =
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      if (diff !== 0) return a.upcoming ? diff : -diff;
      return a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true });
    });

    return { tickets };
  }
}
