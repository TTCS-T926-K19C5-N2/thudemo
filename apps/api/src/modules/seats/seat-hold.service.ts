import { Injectable, Inject, ConflictException, BadRequestException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { ISeatValidator } from './interfaces/seat-validator.interface.js';
import { SEAT_VALIDATOR } from './interfaces/seat-validator.interface.js';

export interface HoldSeatsParams {
  showtimeId: string;
  seatIds: string[];
  userId: string;
}

export interface HoldSeatsResult {
  success: boolean;
  message: string;
  expiresIn: number;
  heldSeats: string[];
}

@Injectable()
export class SeatHoldService {
  private readonly HOLD_TTL_SECONDS = 600; // 10 minutes

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject(SEAT_VALIDATOR) private readonly seatValidator: ISeatValidator,
  ) {}

  private getSeatKey(showtimeId: string, seatId: string): string {
    return `hold:showtime:${showtimeId}:seat:${seatId}`;
  }

  async holdSeats(params: { showtimeId: string; seatIds: string[]; userId: string }): Promise<HoldSeatsResult> {
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

    const acquiredKeys: string[] = [];
    const heldAt = Date.now();
    const payload = JSON.stringify({ userId, heldAt });

    // 2. Atomic Multi-Lock từng ghế với Redis SET key val EX 600 NX
    for (const seatId of seatIds) {
      const key = this.getSeatKey(showtimeId, seatId);
      const result = await this.redis.set(key, payload, 'EX', this.HOLD_TTL_SECONDS, 'NX');

      if (result === 'OK') {
        acquiredKeys.push(key);
      } else {
        // 3. Rollback: Nếu có ghế bị trùng, xóa toàn bộ các ghế đã giữ thành công trước đó
        if (acquiredKeys.length > 0) {
          await this.redis.del(...acquiredKeys);
        }
        throw new ConflictException(`Ghế ${seatId} hiện đang được người khác giữ hoặc không khả dụng`);
      }
    }

    return {
      success: true,
      message: 'Giữ ghế thành công',
      expiresIn: this.HOLD_TTL_SECONDS,
      heldSeats: seatIds,
    };
  }

  async releaseSeats(showtimeId: string, seatIds: string[]): Promise<void> {
    if (!seatIds || seatIds.length === 0) return;
    const keys = seatIds.map((seatId) => this.getSeatKey(showtimeId, seatId));
    await this.redis.del(...keys);
  }

  async getHeldSeat(showtimeId: string, seatId: string): Promise<{ userId: string; heldAt: number } | null> {
    const key = this.getSeatKey(showtimeId, seatId);
    const data = await this.redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}
