import {
  Injectable,
  Inject,
  Optional,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service.js';

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD';

export interface SeatCheckResult {
  seatId: string;
  status: SeatStatus;
}

/**
 * Service kiểm tra trạng thái ghế tích hợp từ mô hình Prisma T-19 và Redis
 */
@Injectable()
export class SeatStatusQueryService {
  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() @Inject('REDIS_CLIENT') private readonly redis?: Redis,
  ) {}

  private getSeatKey(showtimeId: string, seatId: string): string {
    return `hold:showtime:${showtimeId}:seat:${seatId}`;
  }

  /**
   * Xác thực toàn bộ ghế phải ở trạng thái AVAILABLE trước khi tạo Hold.
   * Nếu có ghế đã bị HELD hoặc BOOKED/SOLD, ném ra lỗi ConflictException (409) phù hợp.
   * Nếu ghế không tồn tại, ném ra BadRequestException (400).
   */
  async ensureSeatsAvailable(
    showtimeId: string,
    seatIds: string[],
    currentUserId?: string,
  ): Promise<void> {
    if (!showtimeId || typeof showtimeId !== 'string' || !showtimeId.trim()) {
      throw new BadRequestException('showtimeId is required');
    }

    if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      throw new BadRequestException('seatIds must be a non-empty array');
    }

    const now = new Date();

    // 1. Kiểm tra trạng thái trong Database Prisma (T-19) nếu có dữ liệu
    if (this.prisma) {
      try {
        const client = this.prisma as any;
        const showtimeModel = client.showtime || client.showTime;
        const seatModel = client.seat || client.seats;

        if (showtimeModel && seatModel) {
          const showtime = await showtimeModel.findUnique({
            where: { id: showtimeId },
            select: { id: true },
          });

          if (showtime) {
            const seats = await seatModel.findMany({
              where: {
                showtimeId,
                OR: [
                  { id: { in: seatIds } },
                  ...seatIds.map((sid: string) => {
                    const match = sid.match(/^([A-Za-z]+)(\d+)$/);
                    if (match) {
                      return {
                        seatRow: match[1].toUpperCase(),
                        seatNumber: parseInt(match[2], 10),
                      };
                    }
                    return { id: sid };
                  }),
                ],
              },
              include: {
                holds: {
                  where: {
                    expiresAt: { gt: now },
                  },
                  select: {
                    id: true,
                    userId: true,
                  },
                  take: 1,
                },
                tickets: {
                  where: {
                    status: 'PAID',
                  },
                  select: {
                    id: true,
                  },
                  take: 1,
                },
              },
            });

            // Kiểm tra ghế không tồn tại
            if (seats.length < seatIds.length) {
              throw new BadRequestException(
                'Một hoặc nhiều ghế được chọn không tồn tại cho suất chiếu này',
              );
            }

            for (const seat of seats) {
              const seatLabel = seat.seatRow && seat.seatNumber
                ? `${seat.seatRow}${seat.seatNumber}`
                : seat.id;

              // Kiểm tra ghế đã bán/đặt (BOOKED/SOLD)
              if (seat.tickets && seat.tickets.length > 0) {
                throw new ConflictException(
                  `Ghế ${seatLabel} đã được đặt hoặc đã bán`,
                );
              }

              // Kiểm tra ghế đang bị người khác giữ (HELD trong DB)
              if (
                seat.holds &&
                seat.holds.length > 0 &&
                (!currentUserId || seat.holds[0].userId !== currentUserId)
              ) {
                throw new ConflictException(
                  `Ghế ${seatLabel} đã bị người khác chọn`,
                );
              }
            }
          }
        }
      } catch (err: any) {
        if (
          err instanceof BadRequestException ||
          err instanceof ConflictException ||
          err instanceof NotFoundException
        ) {
          throw err;
        }
      }
    }

    // 2. Kiểm tra trạng thái HELD trong Redis (Atomic Seat Holds)
    if (this.redis) {
      const nowMs = Date.now();
      for (const seatId of seatIds) {
        const key = this.getSeatKey(showtimeId, seatId);
        const data = await this.redis.get(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);

            // Kiểm tra điều kiện hết hạn (T-28): nếu expiresAt <= now, coi là AVAILABLE
            let expiryTimestamp: number | null = null;
            if (parsed.expiresAt) {
              expiryTimestamp = new Date(parsed.expiresAt).getTime();
            } else if (parsed.heldAt) {
              expiryTimestamp = parsed.heldAt + 600 * 1000;
            }

            if (expiryTimestamp !== null && expiryTimestamp <= nowMs) {
              // Lazy cleanup
              this.redis.del(key).catch(() => {});
              continue;
            }

            if (
              !currentUserId ||
              (parsed.userId && parsed.userId !== currentUserId)
            ) {
              throw new ConflictException(`Ghế ${seatId} đã bị người khác chọn`);
            }
          } catch (e: any) {
            if (e instanceof ConflictException) throw e;
            if (!currentUserId || data !== currentUserId) {
              throw new ConflictException(`Ghế ${seatId} đã bị người khác chọn`);
            }
          }
        }
      }
    }
  }

  /**
   * Lấy trạng thái của một ghế (T-19 + T-28)
   */
  async getSeatStatus(showtimeId: string, seatId: string): Promise<SeatStatus> {
    if (this.redis) {
      const key = this.getSeatKey(showtimeId, seatId);
      const data = await this.redis.get(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          let expiryTimestamp: number | null = null;
          if (parsed.expiresAt) {
            expiryTimestamp = new Date(parsed.expiresAt).getTime();
          } else if (parsed.heldAt) {
            expiryTimestamp = parsed.heldAt + 600 * 1000;
          }
          if (expiryTimestamp !== null && expiryTimestamp <= Date.now()) {
            this.redis.del(key).catch(() => {});
            return 'AVAILABLE';
          }
          return 'HELD';
        } catch {
          return 'HELD';
        }
      }
    }
    return 'AVAILABLE';
  }
}
