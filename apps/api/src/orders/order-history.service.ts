import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
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
            _count: {
              select: {
                payments: true,
                logs: { where: { type: 'PAYMENT_ATTEMPT' } },
              },
            },
            payments: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                id: true,
                status: true,
                attemptNo: true,
                amount: true,
                gateway: true,
                transactionId: true,
                createdAt: true,
              },
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
          paymentAttempts: order._count.logs || order._count.payments,
          latestPayment: order.payments[0]
            ? {
                ...order.payments[0],
                attemptNo: order.payments[0].attemptNo ?? order._count.payments,
              }
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
            _count: {
              select: {
                items: true,
                payments: true,
                logs: { where: { type: 'PAYMENT_ATTEMPT' } },
              },
            },
            payments: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                id: true,
                status: true,
                attemptNo: true,
                amount: true,
                gateway: true,
                transactionId: true,
                createdAt: true,
              },
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
          paymentAttempts: order._count.logs || order._count.payments,
          latestPayment: order.payments[0]
            ? {
                ...order.payments[0],
                attemptNo: order.payments[0].attemptNo ?? order._count.payments,
              }
            : null,
          order: { ...view, paymentExpiresAt: expiresAt, items },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async audit(id: string) {
    const order = await this.db.order.findUnique({
      where: { id },
      select: {
        id: true,
        holdSessionId: true,
        holdToken: true,
        showtimeId: true,
        logs: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            type: true,
            attemptNo: true,
            detail: true,
            createdAt: true,
          },
        },
        tickets: {
          select: {
            seatLabel: true,
            logs: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                action: true,
                actorId: true,
                detail: true,
                createdAt: true,
              },
            },
          },
        },
        items: {
          select: {
            id: true,
            seatId: true,
            seat: { select: { row: true, seatNumber: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

    const sanitize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sanitize);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key]) => !/(email|token|secret|signature|password|qr)/i.test(key),
          )
          .map(([key, nested]) => [key, sanitize(nested)]),
      );
    };
    const events: {
      id: string;
      source: string;
      action: string;
      actorId: string | null;
      actorType: string;
      at: Date;
      fromStatus: string | null;
      toStatus: string | null;
      detail: unknown;
      attemptNo: number | null;
    }[] = [];
    const objectDetail = (value: unknown): Record<string, unknown> => {
      const result = sanitize(value);
      return result && typeof result === 'object' && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};
    };

    for (const log of order.logs) {
      const detail = objectDetail(log.detail);
      events.push({
        id: log.id,
        source: 'ORDER',
        action: log.type,
        actorId: typeof detail.actorId === 'string' ? detail.actorId : null,
        actorType:
          typeof detail.actorType === 'string' ? detail.actorType : 'SYSTEM',
        at: log.createdAt,
        fromStatus:
          typeof detail.fromStatus === 'string' ? detail.fromStatus : null,
        toStatus: typeof detail.toStatus === 'string' ? detail.toStatus : null,
        detail,
        attemptNo: log.attemptNo,
      });
    }
    for (const ticket of order.tickets) {
      for (const log of ticket.logs) {
        const detail = objectDetail(log.detail);
        events.push({
          id: log.id,
          source: 'TICKET',
          action: log.action,
          actorId: log.actorId,
          actorType: log.actorId ? 'USER' : 'SYSTEM',
          at: log.createdAt,
          fromStatus:
            typeof detail.fromStatus === 'string' ? detail.fromStatus : null,
          toStatus:
            typeof detail.toStatus === 'string' ? detail.toStatus : null,
          detail: { ...detail, seat: ticket.seatLabel },
          attemptNo: null,
        });
      }
    }
    if (order.holdSessionId && order.holdToken) {
      const holdLogs = await this.db.holdLog.findMany({
        where: {
          orderId: order.id,
          showtimeId: order.showtimeId,
          holdSessionId: order.holdSessionId,
          token: order.holdToken,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      for (const log of holdLogs) {
        events.push({
          id: log.id,
          source: 'HOLD',
          action: log.action,
          actorId: log.actorId,
          actorType: log.actorType,
          at: log.createdAt,
          fromStatus: log.fromExpiresAt ? 'HELD' : null,
          toStatus:
            log.action === 'RELEASED' || log.action === 'EXPIRED'
              ? 'AVAILABLE'
              : 'HELD',
          detail: {
            seats: log.seatIds,
            fromExpiresAt: log.fromExpiresAt,
            toExpiresAt: log.toExpiresAt,
          },
          attemptNo: null,
        });
      }
    }
    const itemIds = order.items.map((item) => item.id);
    if (itemIds.length) {
      let admissions: {
        id: string;
        ticketId: string;
        staffId: string;
        kind: string;
        reason: string | null;
        enteredAt: Date;
        gateName: string | null;
      }[];
      try {
        admissions = await this.db.$queryRaw<typeof admissions>(Prisma.sql`
          SELECT id, "ticketId", "staffId", kind, reason, "enteredAt", "gateName"
          FROM ticket_admissions WHERE "ticketId" = ANY(${itemIds}::uuid[])
          ORDER BY "enteredAt", id
        `);
      } catch {
        throw new ServiceUnavailableException(
          'Chưa thể tải ledger check-in; kiểm tra migration S-31 đã được áp dụng.',
        );
      }
      const itemById = new Map(order.items.map((item) => [item.id, item]));
      for (const admission of admissions) {
        const item = itemById.get(admission.ticketId);
        events.push({
          id: admission.id,
          source: 'ADMISSION',
          action:
            admission.kind === 'EXCEPTION' ? 'CHECK_IN_EXCEPTION' : 'CHECK_IN',
          actorId: admission.staffId,
          actorType: 'STAFF',
          at: admission.enteredAt,
          fromStatus: null,
          toStatus: admission.kind,
          detail: {
            gateName: admission.gateName,
            reason: admission.reason,
            seat: item ? `${item.seat.row}-${item.seat.seatNumber}` : null,
          },
          attemptNo: null,
        });
      }
    }
    events.sort(
      (a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id),
    );
    return { orderId: order.id, events };
  }
}
