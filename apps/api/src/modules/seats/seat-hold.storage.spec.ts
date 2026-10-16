import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeatHoldStorage } from './seat-hold.storage.js';
import { ConflictException, BadRequestException } from '@nestjs/common';
import type { Redis } from 'ioredis';

describe('SeatHoldStorage', () => {
  let storage: SeatHoldStorage;
  let mockRedis: {
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    scan: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRedis = {
      set: vi.fn(),
      del: vi.fn(),
      get: vi.fn(),
      scan: vi.fn(),
    };

    storage = new SeatHoldStorage(mockRedis as unknown as Redis);
  });

  describe('saveHold', () => {
    it('lưu thành công thông tin giữ ghế với TTL 600s mặc định và đầy đủ các trường', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const options = {
        holdId: 'hold_custom_123',
        showtimeId: 'st_101',
        seatIds: ['A1', 'A2'],
        userId: 'user_456',
      };

      const result = await storage.saveHold(options);

      expect(result.holdId).toBe('hold_custom_123');
      expect(result.showtimeId).toBe('st_101');
      expect(result.seatIds).toEqual(['A1', 'A2']);
      expect(result.userId).toBe('user_456');
      expect(result.expiresAt).toBeDefined();

      expect(mockRedis.set).toHaveBeenCalledTimes(2);
      expect(mockRedis.set).toHaveBeenNthCalledWith(
        1,
        'hold:showtime:st_101:seat:A1',
        expect.stringContaining('hold_custom_123'),
        'EX',
        600,
        'NX',
      );
    });

    it('tự động rollback nếu ghế bị conflict', async () => {
      mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

      await expect(
        storage.saveHold({
          showtimeId: 'st_101',
          seatIds: ['A1', 'A2'],
          userId: 'user_456',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockRedis.del).toHaveBeenCalledWith('hold:showtime:st_101:seat:A1');
    });

    it('báo lỗi BadRequest khi thiếu showtimeId hoặc seatIds rỗng', async () => {
      await expect(
        storage.saveHold({
          showtimeId: '',
          seatIds: ['A1'],
          userId: 'user_1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        storage.saveHold({
          showtimeId: 'st_1',
          seatIds: [],
          userId: 'user_1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getHold & getHoldBySeat', () => {
    it('lấy đúng phiên giữ ghế theo showtimeId và seatId', async () => {
      const mockRecord = {
        holdId: 'hold_999',
        showtimeId: 'st_101',
        seatIds: ['A1'],
        userId: 'user_123',
        heldAt: Date.now(),
        expiresAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockRecord));

      const result = await storage.getHoldBySeat('st_101', 'A1');
      expect(result).toEqual(mockRecord);
      expect(mockRedis.get).toHaveBeenCalledWith('hold:showtime:st_101:seat:A1');
    });

    it('lấy phiên giữ ghế theo holdId thông qua SCAN', async () => {
      const mockRecord = {
        holdId: 'hold_target',
        showtimeId: 'st_101',
        seatIds: ['B1'],
        userId: 'user_abc',
        heldAt: Date.now(),
        expiresAt: new Date().toISOString(),
      };

      mockRedis.scan.mockResolvedValueOnce(['0', ['hold:showtime:st_101:seat:B1']]);
      mockRedis.get.mockResolvedValue(JSON.stringify(mockRecord));

      const result = await storage.getHold('hold_target');
      expect(result).toEqual(mockRecord);
    });
  });

  describe('deleteHold & releaseHold', () => {
    it('xóa các key liên quan đến holdId khi releaseHold', async () => {
      const mockRecord = {
        holdId: 'hold_to_delete',
        showtimeId: 'st_101',
        seatIds: ['A1'],
        userId: 'user_abc',
      };

      mockRedis.scan.mockResolvedValueOnce(['0', ['hold:showtime:st_101:seat:A1']]);
      mockRedis.get.mockResolvedValue(JSON.stringify(mockRecord));
      mockRedis.del.mockResolvedValue(1);

      const success = await storage.releaseHold('hold_to_delete');
      expect(success).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('hold:showtime:st_101:seat:A1');
    });
  });

  describe('releaseSeats', () => {
    it('xóa danh sách ghế theo showtimeId và seatIds', async () => {
      await storage.releaseSeats('st_101', ['A1', 'A2']);
      expect(mockRedis.del).toHaveBeenCalledWith(
        'hold:showtime:st_101:seat:A1',
        'hold:showtime:st_101:seat:A2',
      );
    });
  });
});
