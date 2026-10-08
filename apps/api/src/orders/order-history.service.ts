import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { orderPagination } from './order-pagination.js';
import { isOrderExpired } from './order-expiration.js';

const summaryProjection = {
  id: true,
  createdAt: true,
  status: true,
  paymentExpiresAt: true,
  totalAmount: true,
  showtime: {
    select: {
      id: true,
      startTime: true,
      event: { select: { id: true, name: true, location: true } },
    },
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

type Summary = Prisma.OrderGetPayload<{ select: typeof summaryProjection }>;

export function effectiveOrderStatus(
  status: OrderStatus,
  expiresAt: Date,
  serverTime: Date,
): OrderStatus {
  return isOrderExpired({ status, paymentExpiresAt: expiresAt }, serverTime)
    ? 'EXPIRED'
    : status;
}

function summary(order: Summary, serverTime: Date) {
  return {
    id: order.id,
    // Display code is a reversible, complete encoding of the existing order ID,
    // not a second database identifier or a truncated value that can collide.
    code: `DH-${BigInt(`0x${order.id.replaceAll('-', '')}`)
      .toString(36)
      .toUpperCase()}`,
    createdAt: order.createdAt,
    status: effectiveOrderStatus(
      order.status,
      order.paymentExpiresAt,
      serverTime,
    ),
    paymentExpiresAt: order.paymentExpiresAt,
    totalAmount: Number(order.totalAmount),
    seatCount: order._count.items,
    showtime: order.showtime,
  };
}

@Injectable()
export class OrderHistoryService {
  constructor(private readonly db: PrismaService) {}

  private async assertOwnership(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
  ) {
    const ownership = await tx.order.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!ownership) throw new NotFoundException('Không tìm thấy đơn hàng.');
    if (ownership.userId !== userId)
      throw new ForbiddenException('Bạn không có quyền xem đơn hàng này.');
  }

  async status(id: string, userId: string) {
    return this.db.$transaction(
      async (tx) => {
        await this.assertOwnership(tx, id, userId);
        const [clock] = await tx.$queryRaw<{ serverTime: Date }[]>(
          Prisma.sql`SELECT clock_timestamp() AS "serverTime"`,
        );
        const order = await tx.order.findFirst({
          where: { id, userId },
          select: {
            id: true,
            status: true,
            paymentExpiresAt: true,
            _count: { select: { payments: true } },
            payments: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { id: true, status: true },
            },
          },
        });
        if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
        const expiry = order.paymentExpiresAt.toISOString();
        return {
          id,
          orderId: id,
          status: effectiveOrderStatus(
            order.status,
            order.paymentExpiresAt,
            clock.serverTime,
          ),
          expiresAt: expiry,
          paymentExpiresAt: expiry,
          serverTime: clock.serverTime.toISOString(),
          latestPayment: order.payments[0]
            ? { ...order.payments[0], attemptNo: order._count.payments }
            : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async list(userId: string, pagination: ReturnType<typeof orderPagination>) {
    const { page, pageSize, skip } = pagination;
    // A consistent snapshot keeps count/page metadata aligned under concurrent writes.
    return this.db.$transaction(
      async (tx) => {
        const [clock] = await tx.$queryRaw<{ serverTime: Date }[]>(
          Prisma.sql`SELECT clock_timestamp() AS "serverTime"`,
        );
        const total = await tx.order.count({ where: { userId } });
        const orders = await tx.order.findMany({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: pageSize,
          select: summaryProjection,
        });
        const totalPages = Math.ceil(total / pageSize);
        return {
          serverTime: clock.serverTime,
          orders: orders.map((order) => summary(order, clock.serverTime)),
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
            hasPrevious: page > 1 && total > 0,
            hasNext: page < totalPages,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async current(id: string, userId: string) {
    return this.db.$transaction(
      async (tx) => {
        // Only ownership is probed before permission is established; no order content
        // is read for another buyer. All content queries are scoped to the session owner.
        await this.assertOwnership(tx, id, userId);
        const [clock] = await tx.$queryRaw<{ serverTime: Date }[]>(
          Prisma.sql`SELECT clock_timestamp() AS "serverTime"`,
        );
        const order = await tx.order.findFirst({
          where: { id, userId },
          select: {
            ...summaryProjection,
            _count: { select: { items: true, payments: true } },
            payments: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { id: true, status: true },
            },
            items: {
              orderBy: { seatId: 'asc' },
              select: {
                id: true,
                seatId: true,
                categoryName: true,
                tierName: true,
                unitPrice: true,
                seat: { select: { row: true, seatNumber: true } },
              },
            },
            event: {
              select: {
                id: true,
                name: true,
                description: true,
                location: true,
                posterPath: true,
                bannerPath: true,
              },
            },
          },
        });
        if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
        const view = summary(order, clock.serverTime);
        const items = order.items.map((item) => ({
          ...item,
          row: item.seat.row,
          seatNumber: item.seat.seatNumber,
          label: `${item.seat.row}-${item.seat.seatNumber}`,
          tierName: item.tierName ?? item.categoryName,
        }));
        const expiresAt = order.paymentExpiresAt.toISOString();
        const event = order.event ?? {
          ...order.showtime.event,
          description: '',
          posterPath: null,
          bannerPath: null,
        };
        return {
          ...view,
          rawStatus: order.status,
          serverTime: clock.serverTime.toISOString(),
          paymentExpiresAt: expiresAt,
          expiresAt,
          remainingSeconds: Math.max(
            0,
            Math.ceil(
              (order.paymentExpiresAt.getTime() - clock.serverTime.getTime()) /
                1000,
            ),
          ),
          isExpired: view.status === 'EXPIRED',
          createdAt: order.createdAt.toISOString(),
          event,
          showtime: {
            ...order.showtime,
            startTime: order.showtime.startTime.toISOString(),
          },
          items,
          created: false,
          latestPayment: order.payments[0]
            ? { ...order.payments[0], attemptNo: order._count.payments }
            : null,
          order: { ...view, paymentExpiresAt: expiresAt, items },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
