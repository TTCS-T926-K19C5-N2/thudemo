import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAYMENT_TTL_MINUTES = 15;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OrderRequest = { holdId: string; seatIds: string[] };
type SeatPrice = {
  id: string;
  row: string;
  seatNumber: number;
  categoryName: string;
  price: number | null;
};

const orderGraph = {
  showtime: {
    select: {
      id: true,
      startTime: true,
      event: { select: { name: true, location: true } },
    },
  },
  items: {
    include: {
      seat: { select: { row: true, seatNumber: true } },
    },
  },
} satisfies Prisma.OrderInclude;

type OrderGraph = Prisma.OrderGetPayload<{ include: typeof orderGraph }>;

export function requestedOrder(body: unknown): OrderRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Thông tin đặt vé không hợp lệ.');
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => key !== 'holdId' && key !== 'seatIds') ||
    typeof value.holdId !== 'string' ||
    !uuid.test(value.holdId) ||
    !Array.isArray(value.seatIds) ||
    value.seatIds.length < 1 ||
    value.seatIds.length > 2000 ||
    value.seatIds.some((id) => typeof id !== 'string' || !uuid.test(id))
  )
    throw new BadRequestException(
      'Cần lượt giữ và danh sách từ 1 đến 2000 ghế hợp lệ.',
    );
  const seatIds = (value.seatIds as string[])
    .map((id) => id.toLowerCase())
    .sort();
  if (new Set(seatIds).size !== seatIds.length)
    throw new BadRequestException('Danh sách ghế không được trùng.');
  return { holdId: value.holdId.toLowerCase(), seatIds };
}

function present(order: OrderGraph) {
  return {
    id: order.id,
    status: order.status,
    totalAmount: order.totalAmount.toString(),
    paymentExpiresAt: order.paymentExpiresAt,
    createdAt: order.createdAt,
    showtime: order.showtime,
    items: order.items
      .map((item) => ({
        seatId: item.seatId,
        row: item.seat.row,
        seatNumber: item.seat.seatNumber,
        categoryName: item.categoryName,
        unitPrice: item.unitPrice,
      }))
      .sort(
        (a, b) =>
          a.row.localeCompare(b.row, 'vi') || a.seatNumber - b.seatNumber,
      ),
  };
}

@Injectable()
export class OrdersService {
  constructor(private readonly db: PrismaService) {}

  async create(
    showtimeId: string,
    buyerId: string,
    sessionHash: string,
    body: unknown,
  ) {
    const input = requestedOrder(body);
    return this.db.$transaction(
      async (tx) => {
        // Serialize retries and concurrent double-clicks for this buyer.
        await tx.$queryRaw`SELECT id FROM users WHERE id=${buyerId}::uuid FOR UPDATE`;
        await tx.$executeRaw`UPDATE orders SET status='EXPIRED', "updatedAt"=clock_timestamp()
          WHERE "buyerId"=${buyerId}::uuid AND "showtimeId"=${showtimeId}::uuid
          AND status='PENDING_PAYMENT' AND "paymentExpiresAt"<=clock_timestamp()`;

        const existing = await tx.order.findFirst({
          where: { buyerId, showtimeId, status: 'PENDING_PAYMENT' },
          include: orderGraph,
        });
        const [{ serverTime }] = await tx.$queryRaw<{ serverTime: Date }[]>`
          SELECT clock_timestamp() AS "serverTime"`;
        if (existing)
          return { created: false, serverTime, order: present(existing) };

        const [showtime] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status FROM showtimes WHERE id=${showtimeId}::uuid FOR SHARE`;
        if (!showtime) throw new NotFoundException('Không tìm thấy suất diễn.');
        if (showtime.status !== 'ON_SALE')
          throw new ConflictException({
            code: 'SHOWTIME_CLOSED',
            message: 'Suất diễn đã đóng bán. Không thể tạo đơn.',
          });

        const [hold] = await tx.$queryRaw<
          { id: string; token: string; expiresAt: Date }[]
        >(Prisma.sql`SELECT id,token,"expiresAt" FROM hold_sessions
          WHERE id=${input.holdId}::uuid AND "showtimeId"=${showtimeId}::uuid
          AND "userId"=${buyerId}::uuid AND "sessionHash"=${sessionHash} FOR UPDATE`);
        if (!hold || hold.expiresAt <= serverTime)
          throw new ConflictException({
            code: 'HOLD_EXPIRED',
            message: 'Lượt giữ ghế đã hết hạn. Hãy chọn lại ghế.',
            lostSeatIds: input.seatIds,
          });

        const active = await tx.$queryRaw<{ seatId: string }[]>(Prisma.sql`
          SELECT "seatId" FROM seat_holds
          WHERE "holdSessionId"=${hold.id}::uuid AND token=${hold.token}::uuid
          AND "expiresAt">clock_timestamp() ORDER BY "seatId" FOR UPDATE`);
        const activeIds = active.map((item) => item.seatId).sort();
        const activeSet = new Set(activeIds);
        const lostSeatIds = input.seatIds.filter((id) => !activeSet.has(id));
        if (lostSeatIds.length)
          throw new ConflictException({
            code: 'HOLD_EXPIRED',
            message: 'Một số ghế đã hết thời gian giữ. Hãy chọn lại ghế.',
            lostSeatIds,
          });
        if (
          activeIds.length !== input.seatIds.length ||
          activeIds.some((id, index) => id !== input.seatIds[index])
        )
          throw new BadRequestException(
            'Danh sách ghế không khớp lượt giữ hiện tại. Hãy tải lại.',
          );

        const seats = await tx.$queryRaw<SeatPrice[]>(Prisma.sql`
          SELECT s.id,s.row,s."seatNumber",c.name AS "categoryName",c.price
          FROM seats s JOIN seat_categories c ON c.id=s."categoryId" AND c."showtimeId"=s."showtimeId"
          WHERE s."showtimeId"=${showtimeId}::uuid
          AND s.id IN (${Prisma.join(input.seatIds.map((id) => Prisma.sql`${id}::uuid`))})`);
        if (seats.length !== input.seatIds.length || seats.some((s) => s.price === null))
          throw new ConflictException({
            code: 'PRICE_UNAVAILABLE',
            message: 'Một số ghế chưa có giá. Hãy tải lại trước khi đặt vé.',
          });

        const [{ paymentExpiresAt }] = await tx.$queryRaw<
          { paymentExpiresAt: Date }[]
        >`SELECT clock_timestamp() + ${PAYMENT_TTL_MINUTES} * interval '1 minute' AS "paymentExpiresAt"`;
        const totalAmount = seats.reduce(
          (sum, seat) => sum + BigInt(seat.price!),
          0n,
        );
        const order = await tx.order.create({
          data: {
            buyerId,
            showtimeId,
            totalAmount,
            paymentExpiresAt,
            items: {
              create: seats.map((seat) => ({
                seatId: seat.id,
                categoryName: seat.categoryName,
                unitPrice: seat.price!,
              })),
            },
          },
          include: orderGraph,
        });
        await tx.holdSession.update({
          where: { id: hold.id },
          data: { expiresAt: paymentExpiresAt },
        });
        const extended = await tx.seatHold.updateMany({
          where: {
            holdSessionId: hold.id,
            token: hold.token,
            seatId: { in: input.seatIds },
          },
          data: { expiresAt: paymentExpiresAt },
        });
        if (extended.count !== input.seatIds.length)
          throw new ConflictException({
            code: 'HOLD_EXPIRED',
            message: 'Không thể gia hạn đủ ghế. Hãy tải lại trước khi đặt vé.',
            lostSeatIds: input.seatIds,
          });
        return { created: true, serverTime, order: present(order) };
      },
      { timeout: 10000, maxWait: 10000 },
    );
  }

  async detail(orderId: string, buyerId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE orders SET status='EXPIRED', "updatedAt"=clock_timestamp()
        WHERE id=${orderId}::uuid AND "buyerId"=${buyerId}::uuid
        AND status='PENDING_PAYMENT' AND "paymentExpiresAt"<=clock_timestamp()`;
      const order = await tx.order.findFirst({
        where: { id: orderId, buyerId },
        include: orderGraph,
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      const [{ serverTime }] = await tx.$queryRaw<{ serverTime: Date }[]>`
        SELECT clock_timestamp() AS "serverTime"`;
      return { serverTime, order: present(order) };
    });
  }
}

