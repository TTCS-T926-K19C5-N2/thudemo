import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type Clock = { serverTime: Date; paymentExpiresAt: Date };
type HoldAuthority = {
  id: string;
  token: string;
  expiresAt: Date;
  expectedSeatIds: string[];
};
type HeldSeat = {
  seatId: string;
  row: string;
  seatNumber: number;
  categoryName: string;
  price: number | null;
  expiresAt: Date;
};
type OrderView = {
  id: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  paymentExpiresAt: Date;
  totalAmount: bigint;
  items: {
    seatId: string;
    categoryName: string;
    unitPrice: number;
    seat: { row: string; seatNumber: number };
  }[];
};

const orderProjection = {
  id: true,
  status: true,
  paymentExpiresAt: true,
  totalAmount: true,
  items: {
    orderBy: { seatId: 'asc' as const },
    select: {
      seatId: true,
      categoryName: true,
      unitPrice: true,
      seat: { select: { row: true, seatNumber: true } },
    },
  },
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly db: PrismaService) {}

  async createFromHold(
    showtimeId: string,
    userId: string,
    sessionHash: string,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          // A stable buyer row serializes double-clicks and requests from two login sessions.
          const buyers = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`,
          );
          if (!buyers.length)
            throw new NotFoundException('Không tìm thấy người mua.');

          const [lookupClock] = await tx.$queryRaw<{ serverTime: Date }[]>(
            Prisma.sql`SELECT clock_timestamp() AS "serverTime"`,
          );

          await tx.order.updateMany({
            where: {
              userId,
              showtimeId,
              status: 'PENDING_PAYMENT',
              paymentExpiresAt: { lte: lookupClock.serverTime },
            },
            data: { status: 'EXPIRED' },
          });

          const existing = await tx.order.findFirst({
            where: {
              userId,
              showtimeId,
              status: 'PENDING_PAYMENT',
              paymentExpiresAt: { gt: lookupClock.serverTime },
            },
            select: orderProjection,
          });
          if (existing)
            return this.response(existing, lookupClock.serverTime, false);

          const shows = await tx.$queryRaw<{ status: string }[]>(
            Prisma.sql`SELECT status FROM showtimes WHERE id=${showtimeId}::uuid FOR SHARE`,
          );
          if (!shows.length)
            throw new NotFoundException('Không tìm thấy suất diễn.');
          if (shows[0].status !== 'ON_SALE')
            throw new ConflictException({
              code: 'SHOWTIME_CLOSED',
              message: 'Suất diễn đã đóng bán. Không thể tạo đơn.',
            });

          const holds = await tx.$queryRaw<HoldAuthority[]>(Prisma.sql`
            SELECT id,token,"expiresAt","expectedSeatIds" FROM hold_sessions
            WHERE "showtimeId"=${showtimeId}::uuid AND "userId"=${userId}::uuid
              AND "sessionHash"=${sessionHash}
            FOR UPDATE`);
          const hold = holds[0];
          if (!hold)
            throw new ConflictException({
              code: 'HOLD_REQUIRED',
              message: 'Hãy giữ ghế trước khi đặt vé.',
            });

          const seats = await tx.$queryRaw<HeldSeat[]>(Prisma.sql`
            SELECT h."seatId",h."expiresAt",s.row,s."seatNumber",c.name AS "categoryName",c.price
            FROM seat_holds h
            JOIN seats s ON s.id=h."seatId" AND s."showtimeId"=h."showtimeId"
            JOIN seat_categories c ON c.id=s."categoryId" AND c."showtimeId"=s."showtimeId"
            WHERE h."holdSessionId"=${hold.id}::uuid AND h.token=${hold.token}::uuid
            ORDER BY h."seatId" FOR UPDATE OF h`);
          // Row locks may have waited across the expiry boundary. Only this fresh
          // DB clock can validate the locked claims and set the payment deadline.
          const [clock] = await tx.$queryRaw<Clock[]>(Prisma.sql`
            WITH current_clock AS (SELECT clock_timestamp() AS now)
            SELECT now AS "serverTime", now + interval '10 minutes' AS "paymentExpiresAt"
            FROM current_clock`);
          const heldById = new Map(seats.map((seat) => [seat.seatId, seat]));
          const lostSeatIds = hold.expectedSeatIds.filter((seatId) => {
            const seat = heldById.get(seatId);
            return (
              hold.expiresAt <= clock.serverTime ||
              !seat ||
              seat.expiresAt <= clock.serverTime
            );
          });
          if (
            hold.expiresAt <= clock.serverTime ||
            !hold.expectedSeatIds.length ||
            lostSeatIds.length
          )
            throw new ConflictException({
              code: 'HOLD_EXPIRED',
              message: 'Một hoặc nhiều ghế đã hết thời gian giữ. Hãy chọn lại.',
              lostSeatIds,
            });
          if (seats.length !== hold.expectedSeatIds.length)
            throw new ConflictException({
              code: 'HOLD_CHANGED',
              message: 'Danh sách giữ ghế đã thay đổi. Hãy tải lại sơ đồ.',
            });
          if (seats.some((seat) => seat.price === null))
            throw new ConflictException({
              code: 'PRICE_UNAVAILABLE',
              message: 'Một hoặc nhiều ghế chưa có giá. Hãy tải lại sơ đồ.',
            });

          const totalAmount = seats.reduce(
            (sum, seat) => sum + BigInt(seat.price!),
            0n,
          );
          const order = await tx.order.create({
            data: {
              userId,
              showtimeId,
              holdSessionId: hold.id,
              holdToken: hold.token,
              paymentExpiresAt: clock.paymentExpiresAt,
              totalAmount,
              items: {
                create: seats.map((seat) => ({
                  seatId: seat.seatId,
                  categoryName: seat.categoryName,
                  unitPrice: seat.price!,
                })),
              },
            },
            select: orderProjection,
          });

          await tx.holdSession.update({
            where: { id: hold.id },
            data: { expiresAt: clock.paymentExpiresAt },
          });
          const extended = await tx.seatHold.updateMany({
            where: { holdSessionId: hold.id, token: hold.token },
            data: { expiresAt: clock.paymentExpiresAt },
          });
          if (extended.count !== seats.length)
            throw new ConflictException({
              code: 'HOLD_CHANGED',
              message: 'Trạng thái giữ ghế vừa thay đổi. Hãy thử lại.',
            });

          this.logger.log(
            JSON.stringify({
              event: 'order_created',
              orderId: order.id,
              showtimeId,
              seatCount: order.items.length,
            }),
          );
          return this.response(order, clock.serverTime, true);
        },
        { timeout: 10000, maxWait: 10000 },
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        JSON.stringify({ event: 'order_create_failed', showtimeId }),
      );
      throw new ServiceUnavailableException({
        code: 'ORDER_UNAVAILABLE',
        message: 'Chưa thể tạo đơn. Hãy thử lại.',
      });
    }
  }

  async current(orderId: string, userId: string) {
    const [clock] = await this.db.$queryRaw<{ serverTime: Date }[]>(
      Prisma.sql`SELECT clock_timestamp() AS "serverTime"`,
    );
    await this.db.order.updateMany({
      where: {
        id: orderId,
        userId,
        status: 'PENDING_PAYMENT',
        paymentExpiresAt: { lte: clock.serverTime },
      },
      data: { status: 'EXPIRED' },
    });
    const order = await this.db.order.findFirst({
      where: { id: orderId, userId },
      select: orderProjection,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return this.response(order, clock.serverTime, false);
  }

  private response(order: OrderView, serverTime: Date, created: boolean) {
    return {
      serverTime,
      created,
      order: {
        ...order,
        totalAmount: Number(order.totalAmount),
      },
    };
  }
}
