import {
  Injectable,
  Inject,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { SeatHoldCountdownResponseDto } from '../dto/seat-hold-countdown.dto.js';

/**
 * Service tính toán đếm ngược thời gian giữ ghế (Task T-24)
 * - Đọc dữ liệu expiresAt / TTL từ lượt hold ghế (T-19 Prisma DB & T-22 Redis)
 * - Trả về: remainingSeconds, isExpired, expiresAt
 * - Tính toán chính xác theo Epoch Timestamp / UTC hệ thống, không bị lệch múi giờ
 */
@Injectable()
export class SeatHoldCountdownService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Tính toán đếm ngược trực tiếp từ một mốc thời gian expiresAt bất kỳ (UTC/Timestamp)
   */
  calculateCountdown(
    expiresAt: string | number | Date,
  ): SeatHoldCountdownResponseDto {
    const expiryMs =
      typeof expiresAt === 'number'
        ? expiresAt
        : new Date(expiresAt).getTime();

    if (isNaN(expiryMs)) {
      throw new BadRequestException('Giá trị expiresAt không hợp lệ');
    }

    const nowMs = Date.now();
    const remainingSeconds = Math.max(0, Math.floor((expiryMs - nowMs) / 1000));
    const isExpired = remainingSeconds <= 0;
    const expiresAtIso = new Date(expiryMs).toISOString();

    return {
      remainingSeconds,
      isExpired,
      expiresAt: expiresAtIso,
    };
  }

  /**
   * Lấy thông tin đếm ngược theo suất chiếu và ghế (T-22 Redis & T-19 Prisma)
   */
  async getCountdownBySeat(
    showtimeId: string,
    seatId: string,
  ): Promise<SeatHoldCountdownResponseDto> {
    const holdKey = `hold:showtime:${showtimeId}:seat:${seatId}`;

    // 1. Đọc dữ liệu và TTL từ Redis (T-22 Atomic Seat Hold)
    const [ttl, rawData] = await Promise.all([
      this.redis.ttl(holdKey),
      this.redis.get(holdKey),
    ]);

    if (ttl > 0 && rawData) {
      try {
        const metadata = JSON.parse(rawData);
        if (metadata?.expiresAt) {
          const result = this.calculateCountdown(metadata.expiresAt);
          return {
            ...result,
            showtimeId,
            seatId,
            holdId: metadata.holdId,
          };
        }
      } catch {
        // Fallback dùng TTL của Redis nếu data không phải JSON
      }

      const nowMs = Date.now();
      const expiresAtIso = new Date(nowMs + ttl * 1000).toISOString();
      return {
        remainingSeconds: ttl,
        isExpired: false,
        expiresAt: expiresAtIso,
        showtimeId,
        seatId,
      };
    }

    // 2. Nếu không có trong Redis, tra cứu từ Prisma DB seat_holds (T-19)
    if (this.prisma) {
      try {
        const client = this.prisma as any;
        const seatHoldModel = client.seatHold || client.seat_holds;
        if (seatHoldModel) {
          const hold = await seatHoldModel.findFirst({
            where: {
              seatId,
              expiresAt: { gt: new Date() },
            },
            orderBy: { expiresAt: 'desc' },
          });

          if (hold && hold.expiresAt) {
            const result = this.calculateCountdown(hold.expiresAt);
            return {
              ...result,
              showtimeId,
              seatId,
              holdId: hold.id,
            };
          }
        }
      } catch {
        // Fallback an toàn nếu database chưa kết nối
      }
    }

    // 3. Ghế không có lượt giữ còn hiệu lực hoặc đã hết hạn
    const nowIso = new Date().toISOString();
    return {
      remainingSeconds: 0,
      isExpired: true,
      expiresAt: nowIso,
      showtimeId,
      seatId,
    };
  }

  /**
   * Lấy thông tin đếm ngược theo holdId
   */
  async getCountdownByHoldId(
    holdId: string,
  ): Promise<SeatHoldCountdownResponseDto> {
    // 1. Quét tìm trong Redis theo metadata.holdId
    const keys = await this.scanHoldKeys('hold:showtime:*:seat:*');
    for (const key of keys) {
      const rawData = await this.redis.get(key);
      if (!rawData) continue;
      try {
        const metadata = JSON.parse(rawData);
        if (metadata?.holdId === holdId && metadata?.expiresAt) {
          const result = this.calculateCountdown(metadata.expiresAt);
          return {
            ...result,
            showtimeId: metadata.showtimeId,
            seatId: metadata.seatIds?.[0],
            holdId,
          };
        }
      } catch {
        continue;
      }
    }

    // 2. Tra cứu trong Prisma DB seat_holds theo ID
    if (this.prisma) {
      try {
        const client = this.prisma as any;
        const seatHoldModel = client.seatHold || client.seat_holds;
        if (seatHoldModel) {
          const hold = await seatHoldModel.findUnique({
            where: { id: holdId },
          });
          if (hold && hold.expiresAt) {
            const result = this.calculateCountdown(hold.expiresAt);
            return {
              ...result,
              seatId: hold.seatId,
              holdId: hold.id,
            };
          }
        }
      } catch {
        // Fallback
      }
    }

    return {
      remainingSeconds: 0,
      isExpired: true,
      expiresAt: new Date().toISOString(),
      holdId,
    };
  }

  private async scanHoldKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, matched] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (matched && matched.length > 0) {
        keys.push(...matched);
      }
    } while (cursor !== '0');
    return Array.from(new Set(keys));
  }
}
