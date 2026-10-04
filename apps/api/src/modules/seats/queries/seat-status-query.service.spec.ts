import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeatStatusQueryService } from './seat-status-query.service.js';
import { ConflictException, BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { Redis } from 'ioredis';

describe('SeatStatusQueryService', () => {
  let service: SeatStatusQueryService;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    mockPrisma = {
      showtime: {
        findUnique: vi.fn(),
      },
      seat: {
        findMany: vi.fn(),
      },
    };

    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
    };

    service = new SeatStatusQueryService(
      mockPrisma as unknown as PrismaService,
      mockRedis as unknown as Redis,
    );
  });

  it('cho phép tiếp tục khi toàn bộ ghế ở trạng thái AVAILABLE', async () => {
    mockPrisma.showtime.findUnique.mockResolvedValue({ id: 'st_101' });
    mockPrisma.seat.findMany.mockResolvedValue([
      { id: 'seat_1', seatRow: 'A', seatNumber: 1, holds: [], tickets: [] },
      { id: 'seat_2', seatRow: 'A', seatNumber: 2, holds: [], tickets: [] },
    ]);

    await expect(
      service.ensureSeatsAvailable('st_101', ['A1', 'A2']),
    ).resolves.toBeUndefined();
  });

  it('ném ra ConflictException khi ghế đã được đặt/bán (BOOKED/SOLD)', async () => {
    mockPrisma.showtime.findUnique.mockResolvedValue({ id: 'st_101' });
    mockPrisma.seat.findMany.mockResolvedValue([
      {
        id: 'seat_1',
        seatRow: 'A',
        seatNumber: 1,
        holds: [],
        tickets: [{ id: 'ticket_1', status: 'PAID' }],
      },
    ]);

    await expect(
      service.ensureSeatsAvailable('st_101', ['A1']),
    ).rejects.toThrow(ConflictException);
  });

  it('ném ra ConflictException khi ghế đang được người khác giữ trong DB', async () => {
    mockPrisma.showtime.findUnique.mockResolvedValue({ id: 'st_101' });
    mockPrisma.seat.findMany.mockResolvedValue([
      {
        id: 'seat_1',
        seatRow: 'A',
        seatNumber: 1,
        holds: [{ id: 'hold_1', userId: 'other_user' }],
        tickets: [],
      },
    ]);

    await expect(
      service.ensureSeatsAvailable('st_101', ['A1'], 'my_user_id'),
    ).rejects.toThrow(ConflictException);
  });

  it('ném ra ConflictException khi ghế đang bị giữ trong Redis', async () => {
    mockPrisma.showtime.findUnique.mockResolvedValue(null); // Không có DB, kiểm tra qua Redis
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ userId: 'other_user', expiresAt: new Date().toISOString() }),
    );

    await expect(
      service.ensureSeatsAvailable('st_101', ['A1'], 'my_user_id'),
    ).rejects.toThrow('Ghế A1 đã bị người khác chọn');
  });

  it('ném ra BadRequestException khi ghế không tồn tại trong suất diễn', async () => {
    mockPrisma.showtime.findUnique.mockResolvedValue({ id: 'st_101' });
    mockPrisma.seat.findMany.mockResolvedValue([]); // Không tìm thấy ghế

    await expect(
      service.ensureSeatsAvailable('st_101', ['A1']),
    ).rejects.toThrow(BadRequestException);
  });
});
