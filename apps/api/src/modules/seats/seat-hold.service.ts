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
import { SeatStatusQueryService } from './queries/seat-status-query.service.js';

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
  holdId: string;
  showtimeId: string;
  seatIds: string[];
  heldSeats: string[]; // Tương thích ngược với các bài test
  expiresInSeconds: number;
  expiresAt: string;
}

@Injectable()
export class SeatHoldService {
  readonly HOLD_TTL_SECONDS = 600; // 10 minutes

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject(SEAT_VALIDATOR) private readonly seatValidator: ISeatValidator,
    @Optional() private readonly seatHoldStorage?: SeatHoldStorage,
    @Optional() private readonly seatStatusQueryService?: SeatStatusQueryService,
  ) {}

  private getSeatKey(showtimeId: string, seatId: string): string {
    return `hold:showtime:${showtimeId}:seat:${seatId}`;
  }

  /**
   * Tạo phiên giữ ghế (Task T-23)
   * 1. Kiểm tra toàn bộ danh sách ghế người dùng chọn đang ở trạng thái AVAILABLE qua T-19 SeatStatusQueryService
   * 2. Gọi tới SeatHoldStorage (T-22) để tạo lượt hold ghế thành công
   * 3. Trả về response gồm: holdId, seatIds, expiresAt, showtimeId
   */
  async holdSeats(params: HoldSeatsParams): Promise<HoldSeatsResult> {
    const { showtimeId, seatIds, userId } = params;

    if (!showtimeId || typeof showtimeId !== 'string' || !showtimeId.trim()) {
      throw new BadRequestException('showtimeId is required');
    }

    if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      throw new BadRequestException('seatIds must be a non-empty array');
    }

    // 1. Kiểm tra ghế tồn tại qua ISeatValidator
    const isValid = await this.seatValidator.validateSeatsExist(showtimeId, seatIds);
    if (!isValid) {
      throw new BadRequestException('Một hoặc nhiều ghế được chọn không tồn tại cho suất chiếu này');
    }

    // 2. Kiểm tra trạng thái ghế (T-19): Ghế phải ở trạng thái AVAILABLE (chưa bị HELD hay BOOKED)
    if (this.seatStatusQueryService) {
      await this.seatStatusQueryService.ensureSeatsAvailable(showtimeId, seatIds, userId);
    }

    const ttl = params.ttlSeconds ?? this.HOLD_TTL_SECONDS;
    const holdId = params.holdId || randomUUID();
    const heldAt = Date.now();
    const expiresAt = new Date(heldAt + ttl * 1000);
    const expiresAtIso = expiresAt.toISOString();

    // 3. Sử dụng SeatHoldStorage (T-22) hoặc Redis Atomic Multi-Lock
    if (this.seatHoldStorage) {
      const record = await this.seatHoldStorage.saveHold({
        holdId,
        showtimeId,
        seatIds,
        userId,
        ttlSeconds: ttl,
      });

      return {
        success: true,
        holdId: record.holdId,
        showtimeId: record.showtimeId,
        seatIds: record.seatIds,
        heldSeats: record.seatIds,
        expiresInSeconds: ttl,
        expiresAt: record.expiresAt,
      };
    }

    // Fallback Redis Atomic Lock trực tiếp (phục vụ unit test khi không inject storage)
    const acquiredKeys: string[] = [];
    const payload = JSON.stringify({
      holdId,
      showtimeId,
      seatIds,
      userId,
      heldAt,
      expiresAt: expiresAtIso,
    });

    for (const seatId of seatIds) {
      const key = this.getSeatKey(showtimeId, seatId);
      const result = await this.redis.set(key, payload, 'EX', ttl, 'NX');

      if (result === 'OK') {
        acquiredKeys.push(key);
      } else {
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
      seatIds,
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
    if (this.seatHoldStorage) {
      await this.seatHoldStorage.releaseSeats(showtimeId, seatIds);
      return;
    }
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
    if (this.seatHoldStorage) {
      return this.seatHoldStorage.getHeldSeat(showtimeId, seatId);
    }
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
    if (this.seatHoldStorage) {
      return this.seatHoldStorage.getHold(holdId);
    }
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
    if (this.seatHoldStorage) {
      return this.seatHoldStorage.deleteHold(holdId);
    }
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
   * Giải phóng giữ ghế theo holdId
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
