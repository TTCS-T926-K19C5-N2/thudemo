import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeatHoldController } from './seat-hold.controller.js';
import type { SeatHoldService } from './seat-hold.service.js';
import type { SeatAvailabilityQueryService } from './queries/seat-availability.query.js';
import type { SeatHoldCountdownService } from './services/seat-hold-countdown.service.js';
import type { ExpiredHoldsResponseDto } from './dto/expired-holds.dto.js';

describe('SeatHoldController (Task T-28 Expired Hold Query & Seat Availability)', () => {
  let controller: SeatHoldController;
  let mockHoldService: Partial<SeatHoldService>;
  let mockQueryService: Partial<SeatAvailabilityQueryService>;
  let mockCountdownService: Partial<SeatHoldCountdownService>;

  beforeEach(() => {
    mockHoldService = {
      holdSeats: vi.fn(),
      releaseSeats: vi.fn(),
    };

    mockQueryService = {
      getSeatsAvailability: vi.fn(),
      getExpiredHolds: vi.fn(),
      releaseExpiredHolds: vi.fn(),
    };

    mockCountdownService = {
      getCountdownBySeat: vi.fn(),
      getCountdownByHoldId: vi.fn(),
      calculateCountdown: vi.fn(),
    };

    controller = new SeatHoldController(
      mockHoldService as SeatHoldService,
      mockQueryService as SeatAvailabilityQueryService,
      mockCountdownService as SeatHoldCountdownService,
    );
  });

  describe('GET :showtimeId/seats (T-28 Availability Query with Lazy Expiry)', () => {
    it('gọi getSeatsAvailability và chuyển đổi query param seatIds đúng cách', async () => {
      const mockResult = [
        { seatId: 'A1', status: 'AVAILABLE' as const },
        { seatId: 'A2', status: 'HELD' as const },
      ];
      (mockQueryService.getSeatsAvailability as any).mockResolvedValueOnce(mockResult);

      const result = await controller.getSeatsAvailability('st_101', 'A1,A2');

      expect(mockQueryService.getSeatsAvailability).toHaveBeenCalledWith('st_101', ['A1', 'A2']);
      expect(result).toEqual(mockResult);
    });
  });

  describe('GET :showtimeId/expired-holds (T-28 Expired Hold Query by Showtime)', () => {
    it('truy vấn danh sách giữ chỗ hết hạn của một suất chiếu cụ thể', async () => {
      const mockResponse: ExpiredHoldsResponseDto = {
        showtimeId: 'st_101',
        totalExpired: 1,
        expiredHolds: [
          {
            holdId: 'h_1',
            showtimeId: 'st_101',
            seatId: 'A1',
            userId: 'u1',
            expiresAt: '2026-10-04T13:45:00.000Z',
            expiredSecondsAgo: 60,
          },
        ],
        queriedAt: '2026-10-04T13:46:00.000Z',
      };

      (mockQueryService.getExpiredHolds as any).mockResolvedValueOnce(mockResponse);

      const result = await controller.getExpiredHoldsByShowtime('st_101');

      expect(mockQueryService.getExpiredHolds).toHaveBeenCalledWith('st_101');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('GET expired-holds (T-28 Expired Hold Query Global / Filtered)', () => {
    it('truy vấn danh sách giữ chỗ hết hạn toàn hệ thống hoặc theo query param', async () => {
      const mockResponse: ExpiredHoldsResponseDto = {
        showtimeId: undefined,
        totalExpired: 2,
        expiredHolds: [
          {
            holdId: 'h_1',
            showtimeId: 'st_101',
            seatId: 'A1',
            expiresAt: '2026-10-04T13:45:00.000Z',
            expiredSecondsAgo: 90,
          },
          {
            holdId: 'h_2',
            showtimeId: 'st_102',
            seatId: 'B1',
            expiresAt: '2026-10-04T13:46:00.000Z',
            expiredSecondsAgo: 30,
          },
        ],
        queriedAt: '2026-10-04T13:46:30.000Z',
      };

      (mockQueryService.getExpiredHolds as any).mockResolvedValueOnce(mockResponse);

      const result = await controller.getExpiredHolds(undefined);

      expect(mockQueryService.getExpiredHolds).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('POST :showtimeId/release-expired-holds (T-28 Cleanup)', () => {
    it('giải phóng các lượt giữ chỗ quá hạn và trả về số lượng giải phóng', async () => {
      (mockQueryService.releaseExpiredHolds as any).mockResolvedValueOnce({
        releasedCount: 2,
        seatIds: ['A1', 'A2'],
      });

      const result = await controller.releaseExpiredHoldsByShowtime('st_101');

      expect(mockQueryService.releaseExpiredHolds).toHaveBeenCalledWith('st_101');
      expect(result).toEqual({ releasedCount: 2, seatIds: ['A1', 'A2'] });
    });
  });
});
