import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ScannerService } from './scanner.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ScannerCryptoService } from './scanner-crypto.service.js';

describe('ScannerService attendance summary', () => {
  const showtimeId = '00000000-0000-4000-8000-000000000001';

  it('returns checked-in and total ticket counts to the owning organizer', async () => {
    const prisma = {
      showtime: {
        findUnique: vi.fn().mockResolvedValue({
          id: showtimeId,
          event: { organizerId: 'organizer-1' },
        }),
      },
      ticket: {
        count: vi.fn().mockResolvedValueOnce(18).mockResolvedValueOnce(6),
      },
    };
    const service = new ScannerService(
      prisma as unknown as PrismaService,
      {} as ScannerCryptoService,
    );

    await expect(
      service.getAttendance(showtimeId, 'organizer-1', ['ORGANIZER']),
    ).resolves.toMatchObject({
      showtimeId,
      totalTickets: 18,
      checkedInTickets: 6,
    });
    expect(prisma.ticket.count).toHaveBeenCalledTimes(2);
  });

  it('does not expose another organizer’s attendance', async () => {
    const prisma = {
      showtime: {
        findUnique: vi.fn().mockResolvedValue({
          id: showtimeId,
          event: { organizerId: 'organizer-2' },
        }),
      },
      ticket: { count: vi.fn() },
    };
    const service = new ScannerService(
      prisma as unknown as PrismaService,
      {} as ScannerCryptoService,
    );

    await expect(
      service.getAttendance(showtimeId, 'organizer-1', ['ORGANIZER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ticket.count).not.toHaveBeenCalled();
  });
});
