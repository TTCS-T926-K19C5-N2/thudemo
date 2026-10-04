import {
  Injectable,
  Inject,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { ISeatValidator } from './interfaces/seat-validator.interface.js';
import { SEAT_VALIDATOR } from './interfaces/seat-validator.interface.js';
import { SeatHoldStorage, type SeatHoldRecord } from './seat-hold.storage.js';

export { SeatHoldStorage, type SeatHoldRecord };

export interface HoldSeatsParams {
  showtimeId: string;
  seatIds: string[];
  userId: string;
  holdId?: string;
  ttlSeconds?: number;
}

export interface HoldSeatsResult {
  success: boolean;
  holdId?: string;
  showtimeId: string;
  heldSeats: string[];
  expiresInSeconds: number;
  expiresAt: string;
}

@Injectable()
export class SeatHoldService {
  readonly HOLD_TTL_SECONDS = 600; // 10 minutes

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject(SEAT_VALIDATOR) private readonly seatValidator: ISeatValidator,
    @Optional() private readonly storage?: SeatHoldStorage,
  ) {}

  private getSeatKey(showtimeId: string, seatId: string): string {
    return `hold:showtime:${showtimeId}:seat:${seatId}`;
  }

  async holdSeats(params: HoldSeatsParams): Promise<HoldSeatsResult> {
    const { showtimeId, seatIds, userId } = params;

    if (!showtimeId || typeof showtimeId !== 'string' || !showtimeId.trim()) {
      throw new BadRequestException('showtimeId is required');
    }

    if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      throw new BadRequestException('seatIds must be a non-empty array');
    }

    // 1. Kiểm tra tồn tại của ghế qua ISeatValidator
    const isValid = await this.seatValidator.validateSeatsExist(showtimeId, seatIds);
    if (!isValid) {
      throw new BadRequestException('Một hoặc nhiều ghế được chọn không tồn tại cho suất chiếu này');
    }

    const ttl = params.ttlSeconds ?? this.HOLD_TTL_SECONDS;
    const holdId = params.holdId || randomUUID();
    const acquiredKeys: string[] = [];
    const heldAt = Date.now();
    const expiresAt = new Date(heldAt + ttl * 1000);
    const expiresAtIso = expiresAt.toISOString();

    // Payload lưu trữ đầy đủ thông tin: holdId, showtimeId, seatIds, userId, expiresAt
    const payload = JSON.stringify({
      holdId,
      showtimeId,
      seatIds,
      userId,
      heldAt,
      expiresAt: expiresAtIso,
    });

    // 2. Atomic Multi-Lock từng ghế với Redis SET key val EX ttl NX
    for (const seatId of seatIds) {
      const key = this.getSeatKey(showtimeId, seatId);
      const result = await this.redis.set(key, payload, 'EX', ttl, 'NX');

      if (result === 'OK') {
        acquiredKeys.push(key);
      } else {
        // 3. Rollback: Nếu có BẤT KỲ ghế nào bị trùng, xóa toàn bộ các ghế đã giữ thành công trước đó
        if (acquiredKeys.length > 0) {
          await this.redis.del(...acquiredKeys);
        }
        throw new ConflictException(`Ghế ${seatId} đã bị người khác chọn`);
      }
    }

    return {
      success: true,
      holdId,
      showtimeId,
      heldSeats: seatIds,
      expiresInSeconds: ttl,
      expiresAt: expiresAtIso,
    };
  }

  /**
   * Giải phóng danh sách ghế theo showtimeId và seatIds
   */
  async releaseSeats(showtimeId: string, seatIds: string[]): Promise<void> {
    if (!seatIds || seatIds.length === 0) return;
    const keys = seatIds.map((seatId) => this.getSeatKey(showtimeId, seatId));
    await this.redis.del(...keys);
  }

  /**
   * Lấy thông tin giữ ghế theo showtimeId và seatId
   */
  async getHeldSeat(
    showtimeId: string,
    seatId: string,
  ): Promise<SeatHoldRecord | null> {
    const key = this.getSeatKey(showtimeId, seatId);
    const data = await this.redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Lấy thông tin giữ ghế theo holdId
   */
  async getHold(holdId: string): Promise<SeatHoldRecord | null> {
    if (!holdId) return null;
    const keys = await this.scanKeys('hold:showtime:*:seat:*');
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (!data) continue;
      try {
        const record = JSON.parse(data) as SeatHoldRecord;
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
   * Xóa / hủy giữ ghế theo holdId
   */
  async deleteHold(holdId: string): Promise<boolean> {
    if (!holdId) return false;
    const keys = await this.scanKeys('hold:showtime:*:seat:*');
    const toDelete: string[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (!data) continue;
      try {
        const record = JSON.parse(data) as SeatHoldRecord;
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
   * Giải phóng giữ ghế theo holdId (alias của deleteHold)
   */
  async releaseHold(holdId: string): Promise<boolean> {
    return this.deleteHold(holdId);
  }

  private async scanKeys(pattern: string): Promise<string[]> {
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
