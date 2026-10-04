import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeatHoldCountdownService } from './seat-hold-countdown.service.js';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { Redis } from 'ioredis';

describe('SeatHoldCountdownService', () => {
  let service: SeatHoldCountdownService;
  let mockRedis: {
    ttl: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    scan: ReturnType<typeof vi.fn>;
  };
  let mockPrisma: any;

  beforeEach(() => {
    mockRedis = {
      ttl: vi.fn(),
      get: vi.fn(),
      scan: vi.fn(),
    };

    mockPrisma = {
      seatHold: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
    };

    service = new SeatHoldCountdownService(
      mockRedis as unknown as Redis,
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('calculateCountdown', () => {
    it('tính chính xác remainingSeconds, isExpired, expiresAt cho mốc thời gian trong tương lai', () => {
      const now = Date.now();
      const futureExpiry = new Date(now + 300 * 1000).toISOString(); // 300s = 5 phút sau

      const result = service.calculateCountdown(futureExpiry);

      expect(result.remainingSeconds).toBeGreaterThanOrEqual(299);
      expect(result.remainingSeconds).toBeLessThanOrEqual(300);
      expect(result.isExpired).toBe(false);
      expect(result.expiresAt).toBe(futureExpiry);
    });

    it('trả về remainingSeconds = 0 và isExpired = true khi thời gian đã hết hạn', () => {
      const pastExpiry = new Date(Date.now() - 5000).toISOString(); // 5s trước

      const result = service.calculateCountdown(pastExpiry);

      expect(result.remainingSeconds).toBe(0);
      expect(result.isExpired).toBe(true);
      expect(result.expiresAt).toBe(pastExpiry);
    });

    it('báo lỗi BadRequestException khi giá trị expiresAt không hợp lệ', () => {
      expect(() => service.calculateCountdown('invalid_date_format')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getCountdownBySeat', () => {
    it('đọc chính xác dữ liệu expiresAt từ Redis (T-22)', async () => {
      const futureExpiry = new Date(Date.now() + 600 * 1000).toISOString();
      mockRedis.ttl.mockResolvedValue(600);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          userId: 'user_123',
          holdId: 'hold_999',
          expiresAt: futureExpiry,
        }),
      );

      const result = await service.getCountdownBySeat('st_101', 'A1');

      expect(result.showtimeId).toBe('st_101');
      expect(result.seatId).toBe('A1');
      expect(result.holdId).toBe('hold_999');
      expect(result.remainingSeconds).toBeGreaterThanOrEqual(599);
      expect(result.isExpired).toBe(false);
      expect(result.expiresAt).toBe(futureExpiry);
    });

    it('fallback lấy dữ liệu từ Prisma database (T-19) nếu Redis không có', async () => {
      mockRedis.ttl.mockResolvedValue(-2); // Key không tồn tại trong Redis
      mockRedis.get.mockResolvedValue(null);

      const dbExpiry = new Date(Date.now() + 450 * 1000);
      mockPrisma.seatHold.findFirst.mockResolvedValue({
        id: 'hold_db_1',
        seatId: 'A2',
        expiresAt: dbExpiry,
      });

      const result = await service.getCountdownBySeat('st_101', 'A2');

      expect(result.showtimeId).toBe('st_101');
      expect(result.seatId).toBe('A2');
      expect(result.holdId).toBe('hold_db_1');
      expect(result.remainingSeconds).toBeGreaterThanOrEqual(449);
      expect(result.isExpired).toBe(false);
      expect(result.expiresAt).toBe(dbExpiry.toISOString());
    });

    it('trả về isExpired = true khi không tìm thấy lượt giữ ghế', async () => {
      mockRedis.ttl.mockResolvedValue(-2);
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.seatHold.findFirst.mockResolvedValue(null);

      const result = await service.getCountdownBySeat('st_101', 'A99');

      expect(result.remainingSeconds).toBe(0);
      expect(result.isExpired).toBe(true);
    });
  });

  describe('getCountdownByHoldId', () => {
    it('tìm thấy phiên giữ ghế theo holdId trong Redis', async () => {
      const futureExpiry = new Date(Date.now() + 200 * 1000).toISOString();
      mockRedis.scan.mockResolvedValueOnce(['0', ['hold:showtime:st_101:seat:B1']]);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          holdId: 'hold_target',
          showtimeId: 'st_101',
          seatIds: ['B1'],
          expiresAt: futureExpiry,
        }),
      );

      const result = await service.getCountdownByHoldId('hold_target');

      expect(result.holdId).toBe('hold_target');
      expect(result.remainingSeconds).toBeGreaterThanOrEqual(199);
      expect(result.isExpired).toBe(false);
      expect(result.expiresAt).toBe(futureExpiry);
    });
  });
});
