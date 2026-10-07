import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { isOrderExpired } from './order-expiration.js';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrderDetailResponse = {
  id: string;
  status: OrderStatus;
  rawStatus: OrderStatus;
  totalAmount: number;
  expiresAt: string;
  serverTime: string;
  remainingSeconds: number;
  isExpired: boolean;
  createdAt: string;
  event: {
    id: string;
    name: string;
    description: string;
    location: string;
    posterPath: string | null;
    bannerPath: string | null;
  };
  showtime: {
    id: string;
    startTime: string;
  };
  items: {
    id: string;
    seatId: string;
    row: string;
    seatNumber: number;
    label: string;
    tierName: string;
    unitPrice: number;
  }[];
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly db: PrismaService) {}

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

    // Ignore any totalAmount, prices, unitPrice or status provided in client payload
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const holdSession = await tx.holdSession.findFirst({
        where: {
          showtimeId,
          userId,
          sessionHash,
          expiresAt: { gt: now },
        },
        include: {
          seats: {
            where: {
              expiresAt: { gt: now },
            },
          },
          showtime: {
            include: {
              event: true,
            },
          },
        },
      });

      if (!holdSession || holdSession.seats.length === 0) {
        throw new BadRequestException(
          'Không tìm thấy ghế đang giữ hoặc phiên giữ chỗ đã hết hạn.',
        );
      }

      const heldSeatIds = holdSession.seats.map((s) => s.seatId.toLowerCase());
      const heldSet = new Set(heldSeatIds);

      const targetSeatIds = requestedSeatIds ?? heldSeatIds;
      const allHeldByBuyer = targetSeatIds.every((id) => heldSet.has(id));
      if (!allHeldByBuyer) {
        throw new BadRequestException(
          'Một số ghế không còn được giữ bởi bạn hoặc đã hết hạn.',
        );
      }

      const seats = await tx.seat.findMany({
        where: {
          id: { in: targetSeatIds },
          showtimeId,
        },
        include: {
          category: true,
        },
      });

      if (seats.length !== targetSeatIds.length) {
        throw new BadRequestException('Không tìm thấy thông tin một số ghế.');
      }

      for (const seat of seats) {
        if (seat.category.price === null || seat.category.price === undefined) {
          throw new BadRequestException(
            `Ghế ${seat.row}-${seat.seatNumber} chưa được định giá.`,
          );
        }
      }

      // Authoritative server-side calculation of total amount strictly from DB prices
      const totalAmount = seats.reduce(
        (sum, seat) => sum + (seat.category.price ?? 0),
        0,
      );

      const order = await tx.order.create({
        data: {
          userId,
          eventId: holdSession.showtime.eventId,
          showtimeId,
          status: OrderStatus.PENDING,
          totalAmount,
          expiresAt: holdSession.expiresAt,
          items: {
            create: seats.map((seat) => ({
              seatId: seat.id,
              tierName: seat.category.name,
              unitPrice: seat.category.price!,
            })),
          },
        },
        include: {
          event: true,
          showtime: true,
          items: {
            include: {
              seat: true,
            },
          },
        },
      });

      const serverNow = new Date();
      const remainingSeconds = Math.max(
        0,
        Math.ceil((order.expiresAt.getTime() - serverNow.getTime()) / 1000),
      );

      return {
        id: order.id,
        status: order.status,
        rawStatus: order.status,
        totalAmount: order.totalAmount,
        expiresAt: order.expiresAt.toISOString(),
        serverTime: serverNow.toISOString(),
        remainingSeconds,
        isExpired: isOrderExpired(order, serverNow),
        createdAt: order.createdAt.toISOString(),
        event: {
          id: order.event.id,
          name: order.event.name,
          description: order.event.description,
          location: order.event.location,
          posterPath: order.event.posterPath,
          bannerPath: order.event.bannerPath,
        },
        showtime: {
          id: order.showtime.id,
          startTime: order.showtime.startTime.toISOString(),
        },
        items: order.items.map((item) => ({
          id: item.id,
          seatId: item.seatId,
          row: item.seat.row,
          seatNumber: item.seat.seatNumber,
          label: `${item.seat.row}-${item.seat.seatNumber}`,
          tierName: item.tierName,
          unitPrice: item.unitPrice,
        })),
      };
    });
  }

  async getOrderById(
    orderId: string,
    userId: string,
  ): Promise<OrderDetailResponse> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: {
        event: true,
        showtime: true,
        items: {
          include: {
            seat: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    // Always recalculate total amount from DB seat category prices
    let recalculatedTotal = 0;
    for (const item of order.items) {
      const currentCategoryPrice =
        item.seat?.category?.price ?? item.unitPrice;
      recalculatedTotal += currentCategoryPrice;
    }

    if (recalculatedTotal !== order.totalAmount) {
      this.logger.warn(
        `Order ${order.id} total amount mismatch: recorded=${order.totalAmount}, recalculated=${recalculatedTotal}`,
      );
    }

    const serverNow = new Date();
    const expired = isOrderExpired(order, serverNow);
    const remainingSeconds = Math.max(
      0,
      Math.ceil((order.expiresAt.getTime() - serverNow.getTime()) / 1000),
    );

    return {
      id: order.id,
      status:
        expired && order.status === OrderStatus.PENDING
          ? OrderStatus.EXPIRED
          : order.status,
      rawStatus: order.status,
      totalAmount: recalculatedTotal,
      expiresAt: order.expiresAt.toISOString(),
      serverTime: serverNow.toISOString(),
      remainingSeconds,
      isExpired: expired,
      createdAt: order.createdAt.toISOString(),
      event: {
        id: order.event.id,
        name: order.event.name,
        description: order.event.description,
        location: order.event.location,
        posterPath: order.event.posterPath,
        bannerPath: order.event.bannerPath,
      },
      showtime: {
        id: order.showtime.id,
        startTime: order.showtime.startTime.toISOString(),
      },
      items: order.items.map((item) => ({
        id: item.id,
        seatId: item.seatId,
        row: item.seat.row,
        seatNumber: item.seat.seatNumber,
        label: `${item.seat.row}-${item.seat.seatNumber}`,
        tierName: item.tierName,
        unitPrice: item.seat?.category?.price ?? item.unitPrice,
      })),
    };
  }
}
