import { Injectable, Inject, ConflictException, BadRequestException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export interface SeatHoldRecord {
  holdId: string;
  showtimeId: string;
  seatIds: string[];
  userId: string;
  heldAt: number;
  expiresAt: string;
}

export interface SaveHoldOptions {
  holdId?: string;
  showtimeId: string;
  seatIds: string[];
  userId: string;
  ttlSeconds?: number;
}

@Injectable()
export class SeatHoldStorage {
  readonly defaultTtlSeconds = 600; // 10 minutes

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  getSeatKey(showtimeId: string, seatId: string): string {
    return `hold:showtime:${showtimeId}:seat:${seatId}`;
  }

  /**
   * Lưu thông tin giữ ghế vào Redis với Atomic Multi-Lock (SET key payload EX ttl NX)
   * Tự động rollback nếu xảy ra conflict
   */
  async saveHold(options: SaveHoldOptions): Promise<SeatHoldRecord> {
    const { showtimeId, seatIds, userId } = options;

    if (!showtimeId || typeof showtimeId !== 'string' || !showtimeId.trim()) {
      throw new BadRequestException('showtimeId is required');
    }

    if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      throw new BadRequestException('seatIds must be a non-empty array');
    }

    const ttl = options.ttlSeconds ?? this.defaultTtlSeconds;
    const holdId = options.holdId || randomUUID();
    const heldAt = Date.now();
    const expiresAt = new Date(heldAt + ttl * 1000).toISOString();

    const record: SeatHoldRecord = {
      holdId,
      showtimeId,
      seatIds,
      userId,
      heldAt,
      expiresAt,
    };

    const payload = JSON.stringify(record);
    const acquiredKeys: string[] = [];

    for (const seatId of seatIds) {
      const key = this.getSeatKey(showtimeId, seatId);
      const result = await this.redis.set(key, payload, 'EX', ttl, 'NX');

      if (result === 'OK') {
        acquiredKeys.push(key);
      } else {
        // Rollback nếu có bất kỳ ghế nào bị trùng
        if (acquiredKeys.length > 0) {
          await this.redis.del(...acquiredKeys);
        }
        throw new ConflictException(`Ghế ${seatId} đã bị người khác chọn`);
      }
    }

    return record;
  }

  /**
   * Lấy thông tin giữ ghế theo holdId
   */
  async getHold(holdId: string): Promise<SeatHoldRecord | null> {
    if (!holdId) return null;
    const keys = await this.scanHoldKeys('hold:showtime:*:seat:*');
    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw) as SeatHoldRecord;
        if (record.holdId === holdId) {
          return record;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Lấy thông tin giữ ghế theo showtimeId và seatId
   */
  async getHoldBySeat(showtimeId: string, seatId: string): Promise<SeatHoldRecord | null> {
    const key = this.getSeatKey(showtimeId, seatId);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SeatHoldRecord;
    } catch {
      return null;
    }
  }

  /**
   * Lấy thông tin giữ ghế (tương thích ngược với getHeldSeat)
   */
  async getHeldSeat(showtimeId: string, seatId: string): Promise<SeatHoldRecord | null> {
    return this.getHoldBySeat(showtimeId, seatId);
  }

  /**
   * Xóa toàn bộ giữ ghế gắn liền với holdId
   */
  async deleteHold(holdId: string): Promise<boolean> {
    if (!holdId) return false;
    const keys = await this.scanHoldKeys('hold:showtime:*:seat:*');
    const toDelete: string[] = [];

    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw) as SeatHoldRecord;
        if (record.holdId === holdId) {
          toDelete.push(key);
        }
      } catch {
        continue;
      }
    }

    if (toDelete.length > 0) {
      await this.redis.del(...toDelete);
      return true;
    }
    return false;
  }

  /**
   * Giải phóng giữ ghế theo holdId
   */
  async releaseHold(holdId: string): Promise<boolean> {
    return this.deleteHold(holdId);
  }

  /**
   * Giải phóng danh sách ghế theo showtimeId và danh sách seatIds
   */
  async releaseSeats(showtimeId: string, seatIds: string[]): Promise<void> {
    if (!seatIds || seatIds.length === 0) return;
    const keys = seatIds.map((seatId) => this.getSeatKey(showtimeId, seatId));
    await this.redis.del(...keys);
  }

  /**
   * Quét key an toàn bằng SCAN
   */
  private async scanHoldKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, matched] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (matched && matched.length > 0) {
        keys.push(...matched);
      }
    } while (cursor !== '0');
    return Array.from(new Set(keys));
  }
}
