import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type SeatDisplayStatus = 'SOLD' | 'HELD' | 'AVAILABLE';

// S-46: ghế của vé đã hủy phải trở về trạng thái trống và đặt lại được.
// Module này KHÔNG tạo API hủy vé (thuộc S-45). Nó chỉ cung cấp:
//  - releaseCancelledTicketSeat: trả ghế về trống sau khi vé đã CANCELLED (gọi từ luồng S-45 khi merge).
//  - statusOfSeat: đọc trạng thái ghế theo cùng quy tắc với sơ đồ ghế.
@Injectable()
export class SeatReleaseService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Trả ghế của một vé đã hủy về trạng thái trống.
   * Chỉ đổi `seats.isSold` khi không còn vé hợp lệ nào khác giữ cùng ghế.
   * Idempotent: gọi lại khi ghế đã trống thì không làm gì thêm.
   */
  async releaseCancelledTicketSeat(
    ticketId: string,
  ): Promise<{ released: boolean; seatId: string | null }> {
    return this.db.$transaction(async (tx) => {
      const [ticket] = await tx.$queryRaw<
        { seatId: string | null; status: string }[]
      >(Prisma.sql`
        SELECT "seatId", status::text AS status FROM tickets
        WHERE id = ${ticketId}::uuid
        FOR UPDATE`);
      if (!ticket) throw new NotFoundException('Không tìm thấy vé.');
      if (ticket.status !== 'CANCELLED' || !ticket.seatId)
        return { released: false, seatId: ticket.seatId };

      const [stillSold] = await tx.$queryRaw<{ exists: boolean }[]>(Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM tickets
          WHERE "seatId" = ${ticket.seatId}::uuid
            AND status <> 'CANCELLED'
        ) AS exists`);

      if (stillSold?.exists) return { released: false, seatId: ticket.seatId };

      const count = await tx.$executeRaw(Prisma.sql`
        UPDATE seats SET "isSold" = false
        WHERE id = ${ticket.seatId}::uuid AND "isSold" = true`);

      return { released: count > 0, seatId: ticket.seatId };
    });
  }

  async statusOfSeat(
    showtimeId: string,
    seatId: string,
  ): Promise<SeatDisplayStatus> {
    const [row] = await this.db.$queryRaw<{ status: SeatDisplayStatus }[]>(
      Prisma.sql`
        SELECT CASE
          WHEN s."isSold" THEN 'SOLD'
          WHEN h."expiresAt" > clock_timestamp() THEN 'HELD'
          ELSE 'AVAILABLE' END AS status
        FROM seats s
        LEFT JOIN seat_holds h ON h."seatId" = s.id
        WHERE s.id = ${seatId}::uuid AND s."showtimeId" = ${showtimeId}::uuid`,
    );
    if (!row) throw new NotFoundException('Không tìm thấy ghế.');
    return row.status;
  }
}
