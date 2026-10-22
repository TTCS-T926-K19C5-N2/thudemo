import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScannerService } from './scanner.service.js';
import { ScannerCryptoService } from './scanner-crypto.service.js';
import { TicketStatus } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ScannerService', () => {
  let service: ScannerService;
  let mockPrisma: any;
  let mockCrypto: any;

  const mockShowtimeId = 'showtime-1111-1111-1111-111111111111';
  const mockStaffUserId = 'staff-2222-2222-2222-222222222222';
  const mockOrganizerId = 'organizer-3333-3333-3333-333333333333';

  beforeEach(() => {
    mockCrypto = {
      getKeyId: vi.fn().mockReturnValue('k1'),
      getPublicKeyInfo: vi.fn().mockReturnValue({
        keyId: 'k1',
        key: '-----BEGIN PUBLIC KEY-----\nMOCK_KEY\n-----END PUBLIC KEY-----',
      }),
      signTicket: vi.fn().mockReturnValue('mock-sig'),
      verifyTicket: vi.fn().mockReturnValue(true),
    };

    mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      showtime: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      showtimeStaff: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      ticket: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      order: {
        findUnique: vi.fn(),
      },
    };

    service = new ScannerService(
      mockPrisma,
      mockCrypto as unknown as ScannerCryptoService,
    );
  });

  describe('Authorization: verifyStaffAccess', () => {
    it('allows ADMIN regardless of assignment', async () => {
      await expect(
        service.verifyStaffAccess(mockShowtimeId, 'admin-id', ['ADMIN']),
      ).resolves.toBeUndefined();
    });

    it('allows ORGANIZER if they own the event', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({
        id: mockShowtimeId,
        event: { organizerId: mockOrganizerId },
      });

      await expect(
        service.verifyStaffAccess(mockShowtimeId, mockOrganizerId, [
          'ORGANIZER',
        ]),
      ).resolves.toBeUndefined();
    });

    it('rejects ORGANIZER if they do not own the event', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({
        id: mockShowtimeId,
        event: { organizerId: 'another-organizer' },
      });

      await expect(
        service.verifyStaffAccess(mockShowtimeId, mockOrganizerId, [
          'ORGANIZER',
        ]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows STAFF if assigned in showtime_staff', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({
        id: mockShowtimeId,
        event: { organizerId: 'org' },
      });
      mockPrisma.showtimeStaff.findUnique.mockResolvedValue({
        showtimeId: mockShowtimeId,
        userId: mockStaffUserId,
      });

      await expect(
        service.verifyStaffAccess(mockShowtimeId, mockStaffUserId, ['STAFF']),
      ).resolves.toBeUndefined();
    });

    it('rejects STAFF with 403 Forbidden if not assigned', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({
        id: mockShowtimeId,
        event: { organizerId: 'org' },
      });
      mockPrisma.showtimeStaff.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyStaffAccess(mockShowtimeId, mockStaffUserId, ['STAFF']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if showtime does not exist', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyStaffAccess(mockShowtimeId, mockStaffUserId, ['STAFF']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('S-29 Assigned Showtimes: getAssignedShowtimes', () => {
    it('returns assigned showtimes for staff with ticket counts', async () => {
      const showtimeDate = new Date('2026-10-15T19:00:00.000Z');
      mockPrisma.showtime.findMany.mockResolvedValue([
        {
          id: mockShowtimeId,
          startTime: showtimeDate,
          status: 'ON_SALE',
          event: {
            name: 'Đêm Nhạc Mùa Thu',
            location: 'Nhà hát Hoà Bình',
          },
          _count: { tickets: 100 },
        },
      ]);
      mockPrisma.ticket.count.mockResolvedValue(25);

      const list = await service.getAssignedShowtimes(mockStaffUserId, [
        'STAFF',
      ]);

      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(mockShowtimeId);
      expect(list[0].eventName).toBe('Đêm Nhạc Mùa Thu');
      expect(list[0].totalTickets).toBe(100);
      expect(list[0].checkedInTickets).toBe(25);
      expect(list[0].location).toBe('Nhà hát Hoà Bình');
    });
  });
});
