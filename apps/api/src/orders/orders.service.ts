import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderHistoryService } from './order-history.service.js';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Clock = { serverTime: Date };
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
  status: OrderStatus;
  paymentExpiresAt: Date | null;
  totalAmount: number;
  items: {
    seatId: string;
    categoryName: string | null;
    unitPrice: number;
    seat: { row: string; seatNumber: number };
  }[];
};

export type LatestPaymentInfo = {
  id: string;
  status: PaymentStatus;
  attemptNo: number;
  amount?: number;
  gateway?: string;
  transactionId?: string | null;
  createdAt?: string;
};

export type OrderStatusResponse = {
  id: string;
  orderId: string;
  status: OrderStatus;
  expiresAt: string;
  paymentExpiresAt: string;
  serverTime: string;
  latestPayment: LatestPaymentInfo | null;
};

export type ExpireOrderResult =
  | { status: 'expired'; orderId: string; releasedSeatsCount: number }
  | { status: 'skipped'; orderId: string; reason: string };

export type OrderDetailResponse = Awaited<
  ReturnType<OrderHistoryService['current']>
>;

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

  constructor(
    private readonly db: PrismaService,
    private readonly history: OrderHistoryService,
  ) {}

  async createFromHold(
    showtimeId: string,
    userId: string,
    sessionHash: string,
    requestedSeatIds: string[] | null = null,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
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
              status: { in: ['PENDING', 'PENDING_PAYMENT'] },
              paymentExpiresAt: { lte: lookupClock.serverTime },
            },
            data: { status: 'EXPIRED' },
          });

          const existing = await tx.order.findFirst({
            where: {
              userId,
              showtimeId,
              status: { in: ['PENDING', 'PENDING_PAYMENT'] },
              paymentExpiresAt: { gt: lookupClock.serverTime },
            },
            select: orderProjection,
          });
          if (existing) {
            this.assertRequestedSeats(
              requestedSeatIds,
              existing.items.map((item) => item.seatId),
            );
            return this.response(existing, lookupClock.serverTime, false);
          }

          const shows = await tx.$queryRaw<
            { status: string; eventId: string }[]
          >(
            Prisma.sql`SELECT status, "eventId" FROM showtimes WHERE id=${showtimeId}::uuid FOR SHARE`,
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

          const [clock] = await tx.$queryRaw<Clock[]>(Prisma.sql`
            SELECT clock_timestamp() AS "serverTime"`);
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

          this.assertRequestedSeats(requestedSeatIds, hold.expectedSeatIds);
          if (
            seats.some(
              (seat) => seat.expiresAt.getTime() !== hold.expiresAt.getTime(),
            )
          )
            throw new ConflictException({
              code: 'HOLD_CHANGED',
              message: 'Thời hạn giữ ghế không đồng nhất. Hãy chọn lại ghế.',
            });

          const totalAmount = seats.reduce((sum, seat) => sum + seat.price!, 0);
          const order = await tx.order.create({
            data: {
              userId,
              eventId: shows[0].eventId,
              showtimeId,
              holdSessionId: hold.id,
              holdToken: hold.token,
              status: OrderStatus.PENDING_PAYMENT,
              paymentExpiresAt: hold.expiresAt,
              expiresAt: hold.expiresAt,
              totalAmount,
              items: {
                create: seats.map((seat) => ({
                  seatId: seat.seatId,
                  categoryName: seat.categoryName,
                  tierName: seat.categoryName,
                  unitPrice: seat.price!,
                })),
              },
            },
            select: orderProjection,
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

  async createOrder(
    userId: string,
    sessionHash: string,
    body: unknown,
  ): Promise<OrderDetailResponse> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Dữ liệu yêu cầu không hợp lệ.');
    }

    const payload = body as Record<string, unknown>;
    const showtimeId = payload.showtimeId;
    if (typeof showtimeId !== 'string' || !uuidRegex.test(showtimeId)) {
      throw new BadRequestException('Mã suất diễn không hợp lệ.');
    }

    let requestedSeatIds: string[] | null = null;
    if ('seatIds' in payload && payload.seatIds !== undefined) {
      if (
        !Array.isArray(payload.seatIds) ||
        payload.seatIds.length === 0 ||
        payload.seatIds.some(
          (id) => typeof id !== 'string' || !uuidRegex.test(id),
        )
      ) {
        throw new BadRequestException('Danh sách ghế không hợp lệ.');
      }
      requestedSeatIds = [
        ...new Set((payload.seatIds as string[]).map((id) => id.toLowerCase())),
      ];
    }

    const result = await this.createFromHold(
      showtimeId,
      userId,
      sessionHash,
      requestedSeatIds,
    );
    const detail = await this.history.current(result.order.id, userId);
    return { ...detail, created: result.created };
  }

  async getOrderById(
    orderId: string,
    userId: string,
  ): Promise<OrderDetailResponse> {
    return this.history.current(orderId, userId);
  }

  async getOrderStatus(
    orderId: string,
    userId: string,
  ): Promise<OrderStatusResponse> {
    return this.history.status(orderId, userId);
  }

  async current(orderId: string, userId: string) {
    return this.getOrderById(orderId, userId);
  }

  private assertRequestedSeats(requested: string[] | null, held: string[]) {
    if (
      requested &&
      (requested.length !== held.length ||
        requested.some((id) => !held.includes(id)))
    )
      throw new BadRequestException(
        'Danh sách ghế phải khớp lượt giữ hiện tại.',
      );
  }

  private response(order: OrderView, serverTime: Date, created: boolean) {
    return {
      serverTime,
      created,
      order: {
        ...order,
        totalAmount: Number(order.totalAmount),
        paymentExpiresAt: (order.paymentExpiresAt ?? serverTime).toISOString(),
        items: order.items.map((i) => ({
          ...i,
          categoryName: i.categoryName ?? '',
        })),
      },
    };
  }

  /**
   * S-23: Expire an overdue order in a single transaction.
   * Atomic conditional update ensures only PENDING / PENDING_PAYMENT orders that have
   * passed their expiration time (compared to DB clock) are transitioned to EXPIRED.
   * If successful, releases held seats for this order/hold session.
   */
  async expireOrder(
    orderId: string,
    testHooks?: { failOnRelease?: boolean },
  ): Promise<ExpireOrderResult> {
    return this.db.$transaction(async (tx) => {
      // 1. Conditional atomic update: only PENDING / PENDING_PAYMENT, expiresAt <= clock_timestamp()
      const updated = await tx.$queryRaw<
        { id: string; userId: string; holdSessionId: string | null }[]
      >(Prisma.sql`
        UPDATE orders
        SET status = 'EXPIRED'::"OrderStatus", "updatedAt" = clock_timestamp()
        WHERE id = ${orderId}::uuid
          AND status IN ('PENDING'::"OrderStatus", 'PENDING_PAYMENT'::"OrderStatus")
          AND COALESCE("paymentExpiresAt", "expiresAt") <= clock_timestamp()
        RETURNING id, "userId", "holdSessionId"
      `);

      if (!updated || updated.length === 0) {
        return {
          status: 'skipped',
          orderId,
          reason: 'Order not found, not in pending state, or not yet expired',
        };
      }

      const order = updated[0];

      // Simulated failure hook for testing rollback behavior
      if (testHooks?.failOnRelease) {
        throw new Error(
          'Simulated seat release error: transaction should rollback order status to PENDING',
        );
      }

      // 2. Release seat holds for seats of this order that belong to this holdSession/user
      const releaseCondition = order.holdSessionId
        ? Prisma.sql`AND "holdSessionId" = ${order.holdSessionId}::uuid`
        : Prisma.sql`AND "holdSessionId" IN (SELECT id FROM hold_sessions WHERE "userId" = ${order.userId}::uuid)`;

      const releasedSeatsCount = await tx.$executeRaw(Prisma.sql`
        DELETE FROM seat_holds
        WHERE "seatId" IN (
          SELECT oi."seatId"
          FROM order_items oi
          JOIN seats s ON s.id = oi."seatId"
          WHERE oi."orderId" = ${orderId}::uuid
            AND s."isSold" = false
        )
        ${releaseCondition}
      `);

      this.logger.log(
        JSON.stringify({
          event: 'order_expired',
          orderId,
          releasedSeatsCount,
        }),
      );

      return {
        status: 'expired',
        orderId,
        releasedSeatsCount,
      };
    });
  }

  /**
   * S-23: Periodic batch job to find and expire up to N overdue pending orders.
   * Each candidate is processed in its own independent transaction so one failure
   * does not block the remaining orders.
   */
  async processExpiredOrdersBatch(batchSize = 100): Promise<{
    expiredCount: number;
    skippedCount: number;
    errorCount: number;
  }> {
    const candidates = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM orders
      WHERE status IN ('PENDING'::"OrderStatus", 'PENDING_PAYMENT'::"OrderStatus")
        AND COALESCE("paymentExpiresAt", "expiresAt") <= clock_timestamp()
      ORDER BY COALESCE("paymentExpiresAt", "expiresAt") ASC
      LIMIT ${batchSize}
    `);

    let expiredCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const candidate of candidates) {
      try {
        const result = await this.expireOrder(candidate.id);
        if (result.status === 'expired') {
          expiredCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        errorCount++;
        this.logger.error(
          `Failed to expire order ${candidate.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'order_expiry_job',
        candidatesCount: candidates.length,
        expiredCount,
        skippedCount,
        errorCount,
      }),
    );

    return { expiredCount, skippedCount, errorCount };
  }
}
