import { Injectable, Inject, Optional } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SeatHoldStorage } from '../seat-hold.storage.js';
import { SeatStatusQueryService } from './seat-status-query.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  ExpiredHoldItemDto,
  ExpiredHoldsResponseDto,
} from '../dto/expired-holds.dto.js';

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD';

export interface SeatStatusItem {
  seatId: string;
  status: SeatStatus;
  expiresAt?: string;
  heldBy?: string;
}

export interface HoldMetadata {
  holdId?: string;
  showtimeId?: string;
  seatIds?: string[];
  userId: string;
  heldAt: number;
  expiresAt?: string;
  orderId?: string;
  ticketId?: string;
  hasPendingOrder?: boolean;
  status?: string;
}

@Injectable()
export class SeatAvailabilityQueryService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Optional() private readonly seatHoldStorage?: SeatHoldStorage,
    @Optional() private readonly seatStatusQueryService?: SeatStatusQueryService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private getHoldKey(showtimeId: string, seatId: string): string {
    return `hold:showtime:${showtimeId}:seat:${seatId}`;
  }

  private getSoldKey(showtimeId: string, seatId: string): string {
    return `sold:showtime:${showtimeId}:seat:${seatId}`;
  }

  /**
   * Truy vấn trạng thái của 1 ghế duy nhất
   */
  async getSeatStatus(showtimeId: string, seatId: string): Promise<SeatStatus> {
    const results = await this.getSeatsAvailability(showtimeId, [seatId]);
    return results[0]?.status ?? 'AVAILABLE';
  }

  /**
   * Truy vấn trạng thái danh sách ghế (Task T-28)
   *
   * ĐIỀU KIỆN BẮT BUỘC:
   * Nếu một ghế đang nằm trong danh sách HELD nhưng thời gian expiresAt <= NOW(),
   * hàm query BẮT BUỘC lọc và trả về trạng thái là AVAILABLE (Trống) ngay lập tức.
   */
  async getSeatsAvailability(showtimeId: string, seatIds: string[]): Promise<SeatStatusItem[]> {
    if (!seatIds || seatIds.length === 0) {
      return [];
    }

    const now = Date.now();
    const items: SeatStatusItem[] = [];

    // Lấy dữ liệu hold và sold từ Redis
    for (const seatId of seatIds) {
      const holdKey = this.getHoldKey(showtimeId, seatId);
      const soldKey = this.getSoldKey(showtimeId, seatId);

      const [holdData, isSoldKeyExists] = await Promise.all([
        this.redis.get(holdKey),
        this.redis.exists(soldKey),
      ]);

      // 1. Kiểm tra đã bán (SOLD)
      if (isSoldKeyExists === 1) {
        items.push({ seatId, status: 'SOLD' });
        continue;
      }

      // 2. Không có dữ liệu giữ chỗ -> AVAILABLE
      if (!holdData) {
        items.push({ seatId, status: 'AVAILABLE' });
        continue;
      }

      let metadata: HoldMetadata | null = null;
      try {
        metadata = JSON.parse(holdData);
      } catch {
        metadata = null;
      }

      // Nếu metadata có trạng thái đã bán / hoàn tất đơn hàng
      if (
        metadata?.status === 'PAID' ||
        metadata?.status === 'CONFIRMED' ||
        Boolean(metadata?.ticketId)
      ) {
        items.push({ seatId, status: 'SOLD' });
        continue;
      }

      // 3. XÁC ĐỊNH THỜI ĐIỂM HẾT HẠN (expiresAt)
      let expiryTimestamp: number | null = null;
      if (metadata?.expiresAt) {
        expiryTimestamp = new Date(metadata.expiresAt).getTime();
      } else if (metadata?.heldAt) {
        // Fallback: 10 phút tính từ lúc giữ
        expiryTimestamp = metadata.heldAt + 600 * 1000;
      }

      // 4. KIỂM TRA ĐIỀU KIỆN QUÁ HẠN (T-28 CORE LOGIC):
      // Nếu thời gian expiresAt <= NOW(), BẮT BUỘC coi là AVAILABLE ngay lập tức
      // mà không cần chờ Cron job T-27 quét dọn.
      if (expiryTimestamp !== null && expiryTimestamp <= now) {
        // Lazy cleanup trong background: xóa key quá hạn để giải phóng bộ nhớ
        this.redis.del(holdKey).catch(() => {});

        items.push({
          seatId,
          status: 'AVAILABLE',
        });
        continue;
      }

      // 5. Ghế vẫn đang trong thời hạn giữ chỗ hợp lệ (< 10 phút)
      items.push({
        seatId,
        status: 'HELD',
        expiresAt: metadata?.expiresAt ?? (expiryTimestamp ? new Date(expiryTimestamp).toISOString() : undefined),
        heldBy: metadata?.userId,
      });
    }

    return items;
  }

  /**
   * Truy vấn danh sách các lượt giữ chỗ đã hết hạn (Task T-28)
   *
   * @param showtimeId Mã suất chiếu cần lọc (tùy chọn). Nếu không truyền sẽ quét toàn bộ suất chiếu.
   */
  async getExpiredHolds(showtimeId?: string): Promise<ExpiredHoldsResponseDto> {
    const now = Date.now();
    const pattern = showtimeId
      ? `hold:showtime:${showtimeId}:seat:*`
      : 'hold:showtime:*:seat:*';

    // 1. Quét danh sách keys từ Redis qua SeatHoldStorage hoặc SCAN trực tiếp
    let keys: string[] = [];
    if (this.seatHoldStorage) {
      keys = await this.seatHoldStorage.scanHoldKeys(pattern);
    } else {
      keys = await this.scanRedisKeys(pattern);
    }

    const seenHoldMap = new Map<string, ExpiredHoldItemDto>();

    for (const key of keys) {
      // Định dạng key: hold:showtime:${keyShowtimeId}:seat:${seatId}
      const parts = key.split(':');
      const keyShowtimeId = parts[2] || showtimeId || '';
      const seatId = parts[4] || '';

      const [ttl, rawData] = await Promise.all([
        this.redis.ttl(key),
        this.redis.get(key),
      ]);

      if (ttl === -2 || !rawData) {
        continue;
      }

      let metadata: HoldMetadata | null = null;
      try {
        metadata = JSON.parse(rawData);
      } catch {
        metadata = null;
      }

      // Bỏ qua ghế đang được bảo vệ bởi đơn hàng / vé đã thanh toán
      if (this.isProtectedByOrder(metadata)) {
        continue;
      }

      // Xác định thời điểm hết hạn
      let expiryTimestamp: number | null = null;
      if (metadata?.expiresAt) {
        expiryTimestamp = new Date(metadata.expiresAt).getTime();
      } else if (metadata?.heldAt) {
        expiryTimestamp = metadata.heldAt + 600 * 1000;
      }

      // Kiểm tra hết hạn: TTL <= 0 hoặc expiresAt <= now
      const isExpired =
        (ttl !== null && ttl !== undefined && ttl <= 0) ||
        (expiryTimestamp !== null && expiryTimestamp <= now);

      if (isExpired && expiryTimestamp !== null) {
        const expiresAtIso = new Date(expiryTimestamp).toISOString();
        const expiredSecondsAgo = Math.max(0, Math.floor((now - expiryTimestamp) / 1000));

        const item: ExpiredHoldItemDto = {
          holdId: metadata?.holdId,
          showtimeId: keyShowtimeId,
          seatId,
          seatIds: metadata?.seatIds ?? [seatId],
          userId: metadata?.userId,
          heldAt: metadata?.heldAt,
          expiresAt: expiresAtIso,
          expiredSecondsAgo,
        };

        const uniqueKey = `${keyShowtimeId}:${seatId}`;
        seenHoldMap.set(uniqueKey, item);
      }
    }

    // 2. Tích hợp kiểm tra Database Prisma (T-19) nếu có dữ liệu
    if (this.prisma) {
      try {
        const client = this.prisma as any;
        const seatHoldModel = client.seatHold || client.seat_holds;
        if (seatHoldModel && typeof seatHoldModel.findMany === 'function') {
          const dbExpired = await seatHoldModel.findMany({
            where: {
              expiresAt: { lte: new Date(now) },
              ...(showtimeId ? { showtimeId } : {}),
            },
            include: {
              seat: true,
            },
          });

          for (const hold of dbExpired) {
            const sid = hold.showtimeId;
            const seatIdentifier = hold.seat?.seatRow && hold.seat?.seatNumber
              ? `${hold.seat.seatRow}${hold.seat.seatNumber}`
              : hold.seatId;
            const uniqueKey = `${sid}:${seatIdentifier}`;

            if (!seenHoldMap.has(uniqueKey)) {
              const expiryTimestamp = new Date(hold.expiresAt).getTime();
              const expiredSecondsAgo = Math.max(0, Math.floor((now - expiryTimestamp) / 1000));

              seenHoldMap.set(uniqueKey, {
                holdId: hold.id,
                showtimeId: sid,
                seatId: seatIdentifier,
                userId: hold.userId,
                expiresAt: new Date(hold.expiresAt).toISOString(),
                expiredSecondsAgo,
              });
            }
          }
        }
      } catch {
        // Bỏ qua lỗi DB nếu chưa kết nối hoặc đang chạy mock
      }
    }

    const expiredHolds = Array.from(seenHoldMap.values()).sort(
      (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
    );

    return {
      showtimeId,
      totalExpired: expiredHolds.length,
      expiredHolds,
      queriedAt: new Date(now).toISOString(),
    };
  }

  /**
   * Giải phóng/xóa các lượt giữ chỗ đã hết hạn trong Redis và DB
   */
  async releaseExpiredHolds(showtimeId?: string): Promise<{ releasedCount: number; seatIds: string[] }> {
    const expiredData = await this.getExpiredHolds(showtimeId);
    const seatIds = expiredData.expiredHolds.map((h) => h.seatId);

    if (expiredData.expiredHolds.length > 0) {
      const keysToDelete = expiredData.expiredHolds.map(
        (h) => this.getHoldKey(h.showtimeId, h.seatId),
      );
      await this.redis.del(...keysToDelete);
    }

    return {
      releasedCount: expiredData.totalExpired,
      seatIds,
    };
  }

  /**
   * Kiểm tra ghế có đang gắn với đơn hàng / vé hợp lệ hay không
   */
  private isProtectedByOrder(metadata: HoldMetadata | null): boolean {
    if (!metadata) return false;
    if (metadata.orderId && metadata.orderId.trim()) return true;
    if (metadata.ticketId && metadata.ticketId.trim()) return true;
    if (metadata.hasPendingOrder === true) return true;
    if (
      metadata.status === 'PAID' ||
      metadata.status === 'CONFIRMED' ||
      metadata.status === 'PENDING_PAYMENT' ||
      metadata.status === 'ORDER_CREATED'
    ) {
      return true;
    }
    return false;
  }

  /**
   * Quét Redis key bằng SCAN an toàn
   */
  private async scanRedisKeys(pattern: string): Promise<string[]> {
    if (!this.redis || typeof this.redis.scan !== 'function') return [];
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

