import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SeatsService } from './seats.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('SeatsService (TASK T-19: Truy vấn trạng thái 2.000 ghế)', () => {
  let service: SeatsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      showtime: {
        findUnique: vi.fn(),
      },
      seat: {
        findMany: vi.fn(),
        count: vi.fn(),
        createMany: vi.fn(),
      },
      seatCategory: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      seatHold: {
        create: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      ticket: {
        create: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    service = new SeatsService(mockPrisma as unknown as PrismaService);
  });

  describe('getSeatStatusByShowtime', () => {
    const showtimeId = '00000000-0000-0000-0000-000000000001';
    const userId = '00000000-0000-0000-0000-000000000002';

    it('báo lỗi NotFoundException nếu suất diễn không tồn tại', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue(null);

      await expect(
        service.getSeatStatusByShowtime(showtimeId),
      ).rejects.toThrow(NotFoundException);
    });

    it('trả về đúng 3 trạng thái (AVAILABLE, HELD, SOLD)', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({ id: showtimeId });

      const futureDate = new Date(Date.now() + 600000);

      // Giả lập 3 ghế với 3 trạng thái:
      // Ghế 1: Trống (không hold, không ticket) -> AVAILABLE
      // Ghế 2: Đang được giữ bởi userId -> HELD
      // Ghế 3: Đã bán vé -> SOLD
      mockPrisma.seat.findMany.mockResolvedValue([
        {
          id: 'seat-1',
          showtimeId,
          seatRow: 'A',
          seatNumber: 1,
          seatCategoryId: 'cat-vip',
          seatCategory: { id: 'cat-vip', name: 'VIP', price: 500000, color: '#EF4444' },
          holds: [],
          tickets: [],
        },
        {
          id: 'seat-2',
          showtimeId,
          seatRow: 'A',
          seatNumber: 2,
          seatCategoryId: 'cat-vip',
          seatCategory: { id: 'cat-vip', name: 'VIP', price: 500000, color: '#EF4444' },
          holds: [{ id: 'hold-1', userId, expiresAt: futureDate }],
          tickets: [],
        },
        {
          id: 'seat-3',
          showtimeId,
          seatRow: 'A',
          seatNumber: 3,
          seatCategoryId: 'cat-std',
          seatCategory: { id: 'cat-std', name: 'STANDARD', price: 300000, color: '#3B82F6' },
          holds: [],
          tickets: [{ id: 'ticket-1' }],
        },
      ]);

      const result = await service.getSeatStatusByShowtime(showtimeId, userId);

      expect(result.showtimeId).toBe(showtimeId);
      expect(result.totalSeats).toBe(3);
      expect(result.availableCount).toBe(1);
      expect(result.heldCount).toBe(1);
      expect(result.soldCount).toBe(1);

      // Kiểm tra chi tiết 3 ghế
      expect(result.seats[0].status).toBe('AVAILABLE');
      expect(result.seats[0].isMyHold).toBe(false);

      expect(result.seats[1].status).toBe('HELD');
      expect(result.seats[1].isMyHold).toBe(true);
      expect(result.seats[1].holdExpiresAt).toBe(futureDate.toISOString());

      expect(result.seats[2].status).toBe('SOLD');
      expect(result.seats[2].isMyHold).toBe(false);
    });

    it('NFR: Chỉ thực hiện 1 lần truy vấn danh sách ghế, không có vòng lặp truy vấn con (zero N+1)', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({ id: showtimeId });
      mockPrisma.seat.findMany.mockResolvedValue([]);

      await service.getSeatStatusByShowtime(showtimeId);

      // Chỉ gọi findMany đúng 1 lần cho toàn bộ ghế của suất diễn
      expect(mockPrisma.seat.findMany).toHaveBeenCalledTimes(1);
    });

    it('Acceptance Criteria: Xử lý mượt mà và chạy dưới 200ms với 2.000 ghế', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({ id: showtimeId });

      // Sinh bộ dữ liệu 2.000 ghế
      const mock2000Seats = [];
      const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const seatsPerRow = 200; // 10 * 200 = 2000 ghế
      const futureDate = new Date(Date.now() + 600000);

      for (let r = 0; r < rows.length; r++) {
        for (let num = 1; num <= seatsPerRow; num++) {
          const index = r * seatsPerRow + num;
          // Phân bố trạng thái:
          // 80% trống (AVAILABLE)
          // 10% đang giữ (HELD)
          // 10% đã bán (SOLD)
          let holds: any[] = [];
          let tickets: any[] = [];

          if (index % 10 === 0) {
            tickets = [{ id: `ticket-${index}` }];
          } else if (index % 10 === 9) {
            holds = [{ id: `hold-${index}`, userId: 'some-user', expiresAt: futureDate }];
          }

          mock2000Seats.push({
            id: `seat-${index}`,
            showtimeId,
            seatRow: rows[r],
            seatNumber: num,
            seatCategoryId: 'cat-std',
            seatCategory: { id: 'cat-std', name: 'STANDARD', price: 250000, color: '#3B82F6' },
            holds,
            tickets,
          });
        }
      }

      mockPrisma.seat.findMany.mockResolvedValue(mock2000Seats);

      const startTime = performance.now();
      const result = await service.getSeatStatusByShowtime(showtimeId);
      const executionTime = performance.now() - startTime;

      expect(result.totalSeats).toBe(2000);
      expect(result.soldCount).toBe(200);
      expect(result.heldCount).toBe(200);
      expect(result.availableCount).toBe(1600);

      // Yêu cầu AC: dưới 200ms
      expect(executionTime).toBeLessThan(200);
      expect(result.queryDurationMs).toBeLessThan(200);
    });
  });
});
