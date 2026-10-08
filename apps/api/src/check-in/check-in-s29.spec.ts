import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ShowtimeStatus } from '@prisma/client';
import { CheckInControllerS29 } from './check-in-s29.controller.js';
import { CheckInServiceS29 } from './check-in-s29.service.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';

describe('S-29 CheckInServiceS29 & CheckInControllerS29', () => {
  let service: CheckInServiceS29;
  let mockPrisma: {
    showtime: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      showtime: {
        findMany: vi.fn(),
      },
    };
    service = new CheckInServiceS29(mockPrisma as unknown as PrismaService);
  });

  describe('CheckInServiceS29', () => {
    it('returns formatted showtimes happening today with event name and location', async () => {
      const todayDate = new Date();
      mockPrisma.showtime.findMany.mockResolvedValue([
        {
          id: 'showtime-1',
          startTime: todayDate,
          status: ShowtimeStatus.ON_SALE,
          event: {
            name: 'Đêm Nhạc Trịnh Công Sơn',
            location: 'Nhà Hát Lớn Hà Nội',
          },
        },
        {
          id: 'showtime-2',
          startTime: new Date(todayDate.getTime() + 3600000),
          status: ShowtimeStatus.CLOSED,
          event: {
            name: 'Kịch Mùa Hè',
            location: 'Sân Khấu Kịch Tuổi Trẻ',
          },
        },
      ]);

      const result = await service.getTodayShowtimes();

      expect(mockPrisma.showtime.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [ShowtimeStatus.ON_SALE, ShowtimeStatus.CLOSED] },
          }),
          orderBy: { startTime: 'asc' },
        }),
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'showtime-1',
        startTime: todayDate.toISOString(),
        eventName: 'Đêm Nhạc Trịnh Công Sơn',
        location: 'Nhà Hát Lớn Hà Nội',
        status: ShowtimeStatus.ON_SALE,
      });
      expect(result[1]).toEqual({
        id: 'showtime-2',
        startTime: new Date(todayDate.getTime() + 3600000).toISOString(),
        eventName: 'Kịch Mùa Hè',
        location: 'Sân Khấu Kịch Tuổi Trẻ',
        status: ShowtimeStatus.CLOSED,
      });
    });

    it('returns empty array when no showtimes exist today', async () => {
      mockPrisma.showtime.findMany.mockResolvedValue([]);

      const result = await service.getTodayShowtimes();

      expect(result).toEqual([]);
    });

    it('queries with Vietnam timezone (UTC+7) boundaries and excludes DRAFT', async () => {
      mockPrisma.showtime.findMany.mockResolvedValue([]);

      await service.getTodayShowtimes();

      const callArgs = mockPrisma.showtime.findMany.mock.calls[0][0];
      const { startTime, status } = callArgs.where;

      // Check status filter only permits ON_SALE and CLOSED
      expect(status.in).toEqual([ShowtimeStatus.ON_SALE, ShowtimeStatus.CLOSED]);
      expect(status.in).not.toContain(ShowtimeStatus.DRAFT);

      // Check startTime boundaries cover exactly a 24-hour day in UTC+7
      const startMs = startTime.gte.getTime();
      const endMs = startTime.lt.getTime();
      const diffHours = (endMs - startMs) / (1000 * 60 * 60);
      expect(diffHours).toBe(24);

      // Verify start of day in UTC+7 has 0 hours, 0 minutes, 0 seconds in Vietnam time
      const vnStart = new Date(startMs + 7 * 60 * 60 * 1000);
      expect(vnStart.getUTCHours()).toBe(0);
      expect(vnStart.getUTCMinutes()).toBe(0);
      expect(vnStart.getUTCSeconds()).toBe(0);
    });
  });

  describe('CheckInControllerS29', () => {
    it('has @Roles(STAFF) decorator and delegates to service', async () => {
      const mockResult = [
        {
          id: 'showtime-1',
          startTime: new Date().toISOString(),
          eventName: 'Hòa Nhạc',
          location: 'Hà Nội',
          status: 'ON_SALE',
        },
      ];
      const mockCheckInService = {
        getTodayShowtimes: vi.fn().mockResolvedValue(mockResult),
      } as unknown as CheckInServiceS29;

      const controller = new CheckInControllerS29(mockCheckInService);
      const res = await controller.getTodayShowtimes();

      expect(res).toBe(mockResult);
      expect(mockCheckInService.getTodayShowtimes).toHaveBeenCalledTimes(1);

      // Verify Roles metadata
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        CheckInControllerS29.prototype.getTodayShowtimes,
      );
      expect(roles).toEqual(['STAFF']);
    });
  });

  describe('RolesGuard integration with STAFF role (AC check)', () => {
    let reflector: Reflector;
    let guard: RolesGuard;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new RolesGuard(reflector);
    });

    function createMockContext(user?: { id: string; email: string; roles: string[] }) {
      const handler = CheckInControllerS29.prototype.getTodayShowtimes;
      const targetClass = CheckInControllerS29;

      const request = { user } as AuthenticatedRequest;
      return {
        getHandler: () => handler,
        getClass: () => targetClass,
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as unknown as ExecutionContext;
    }

    it('allows access when user has STAFF role', () => {
      const context = createMockContext({
        id: 'user-1',
        email: 'staff@example.com',
        roles: ['STAFF'],
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('denies access (403) when user is authenticated but does not have STAFF role', () => {
      const context = createMockContext({
        id: 'user-2',
        email: 'buyer@example.com',
        roles: ['BUYER'],
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('denies access (403) when user is not attached to request', () => {
      const context = createMockContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
