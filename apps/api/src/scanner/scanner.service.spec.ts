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

    service = new ScannerService(mockPrisma, mockCrypto as unknown as ScannerCryptoService);
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
        service.verifyStaffAccess(mockShowtimeId, mockOrganizerId, ['ORGANIZER']),
      ).resolves.toBeUndefined();
    });

    it('rejects ORGANIZER if they do not own the event', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({
        id: mockShowtimeId,
        event: { organizerId: 'another-organizer' },
      });

      await expect(
        service.verifyStaffAccess(mockShowtimeId, mockOrganizerId, ['ORGANIZER']),
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

  describe('Full Download: getShowtimeTickets (since omitted)', () => {
    it('returns full ticket list, generatedAt, cursor, publicKey, and no PII', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({
        id: mockShowtimeId,
        event: { name: 'Concert Đêm Nhạc Mùa Thu', organizerId: mockOrganizerId },
      });

      const now = new Date();
      mockPrisma.ticket.findMany.mockResolvedValue([
        {
          code: 'TK-AAA111',
          status: TicketStatus.VALID,
          checkedInAt: null,
          seatLabel: 'A-1',
          ticketType: 'VIP',
        },
        {
          code: 'TK-BBB222',
          status: TicketStatus.CHECKED_IN,
          checkedInAt: now,
          seatLabel: 'A-2',
          ticketType: 'STANDARD',
        },
      ]);

      const result = await service.getShowtimeTickets(mockShowtimeId, undefined, {
        id: 'admin-id',
        roles: ['ADMIN'],
      });

      expect(result.showtimeId).toBe(mockShowtimeId);
      expect(result.showtimeName).toBe('Concert Đêm Nhạc Mùa Thu');
      expect(result.publicKey.keyId).toBe('k1');
      expect(result.publicKey.key).toContain('MOCK_KEY');
      expect(result.cursor).toBeDefined();
      expect(result.tickets).toHaveLength(2);

      // Verify ticket mapping
      expect(result.tickets[0]).toEqual({
        code: 'TK-AAA111',
        status: 'valid',
        checkedInAt: null,
        seatLabel: 'A-1',
        ticketType: 'VIP',
      });
      expect(result.tickets[1]).toEqual({
        code: 'TK-BBB222',
        status: 'checked_in',
        checkedInAt: now.toISOString(),
        seatLabel: 'A-2',
        ticketType: 'STANDARD',
      });

      // Strict check: No PII fields anywhere
      for (const t of result.tickets as any[]) {
        expect(t.userName).toBeUndefined();
        expect(t.name).toBeUndefined();
        expect(t.email).toBeUndefined();
        expect(t.phone).toBeUndefined();
        expect(t.phoneNumber).toBeUndefined();
      }

      // Check query filters in full sync: only VALID or CHECKED_IN
      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith({
        where: {
          showtimeId: mockShowtimeId,
          status: {
            in: [TicketStatus.VALID, TicketStatus.CHECKED_IN],
          },
        },
        select: {
          code: true,
          status: true,
          checkedInAt: true,
          seatLabel: true,
          ticketType: true,
        },
        orderBy: { code: 'asc' },
      });
    });

    it('returns 0 tickets cleanly when showtime has no tickets', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({
        id: mockShowtimeId,
        event: { name: 'Chưa có vé', organizerId: mockOrganizerId },
      });
      mockPrisma.ticket.findMany.mockResolvedValue([]);

      const result = await service.getShowtimeTickets(mockShowtimeId, undefined, {
        id: 'admin-id',
        roles: ['ADMIN'],
      });

      expect(result.tickets).toEqual([]);
      expect(result.showtimeId).toBe(mockShowtimeId);
    });
  });

  describe('Incremental Download: getShowtimeTickets (since provided)', () => {
    it('returns only tickets updated after since, including cancelled tickets', async () => {
      mockPrisma.showtime.findUnique.mockResolvedValue({
        id: mockShowtimeId,
        event: { name: 'Concert', organizerId: mockOrganizerId },
      });

      const sinceCursor = '2026-10-08T00:00:00.000Z';
      const checkedInTime = new Date('2026-10-08T01:30:00.000Z');

      mockPrisma.ticket.findMany.mockResolvedValue([
        {
          code: 'TK-NEW999',
          status: TicketStatus.VALID,
          checkedInAt: null,
          seatLabel: 'B-1',
          ticketType: 'VIP',
        },
        {
          code: 'TK-CHK888',
          status: TicketStatus.CHECKED_IN,
          checkedInAt: checkedInTime,
          seatLabel: 'B-2',
          ticketType: 'VIP',
        },
        {
          code: 'TK-CAN777',
          status: TicketStatus.CANCELLED,
          checkedInAt: null,
          seatLabel: 'B-3',
          ticketType: 'STANDARD',
        },
      ]);

      const result = await service.getShowtimeTickets(mockShowtimeId, sinceCursor, {
        id: 'admin-id',
        roles: ['ADMIN'],
      });

      expect(result.tickets).toHaveLength(3);
      expect(result.tickets[0].status).toBe('valid');
      expect(result.tickets[1].status).toBe('checked_in');
      expect(result.tickets[2].status).toBe('cancelled');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith({
        where: {
          showtimeId: mockShowtimeId,
          updatedAt: { gt: new Date(sinceCursor) },
        },
        select: {
          code: true,
          status: true,
          checkedInAt: true,
          seatLabel: true,
          ticketType: true,
        },
        orderBy: { updatedAt: 'asc' },
      });
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

      const list = await service.getAssignedShowtimes(mockStaffUserId, ['STAFF']);

      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(mockShowtimeId);
      expect(list[0].eventName).toBe('Đêm Nhạc Mùa Thu');
      expect(list[0].totalTickets).toBe(100);
      expect(list[0].checkedInTickets).toBe(25);
      expect(list[0].location).toBe('Nhà hát Hoà Bình');
    });
  });
});
