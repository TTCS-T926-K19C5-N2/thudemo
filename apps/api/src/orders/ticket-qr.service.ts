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
      const items = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        SELECT oi.id,o."showtimeId",oi."checkedInAt",s.row,s."seatNumber",oi."categoryName",
          EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CANCELLED') AS cancelled,
          EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CHECKED_IN') AS used
        FROM order_items oi JOIN orders o ON o.id=oi."orderId" JOIN seats s ON s.id=oi."seatId"
        WHERE o.id=${orderId}::uuid AND s."showtimeId"=o."showtimeId" ORDER BY s.row,s."seatNumber"`);
      return {
        tickets: items.map((item) => ({
          ticketId: item.id,
          showtimeId: item.showtimeId,
          seatLabel: `${item.row}-${item.seatNumber}`,
          category: item.categoryName,
          status: item.cancelled
            ? 'CANCELLED'
            : item.checkedInAt || item.used
              ? 'CHECKED_IN'
              : 'VALID',
          qrPayload: item.cancelled
            ? null
            : this.crypto.issueQr(item.id, item.showtimeId),
        })),
      };
    });
  }
}
