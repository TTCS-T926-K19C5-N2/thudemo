import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScannerController } from './scanner.controller.js';
import { ScannerService } from './scanner.service.js';

describe('ScannerController', () => {
  let controller: ScannerController;
  let mockService: Partial<ScannerService>;

  beforeEach(() => {
    mockService = {
      getAssignedShowtimes: vi.fn().mockResolvedValue([]),
      getShowtimeTickets: vi.fn().mockResolvedValue({
        showtimeId: 'st-1',
        showtimeName: 'Show 1',
        generatedAt: '2026-10-08T00:00:00Z',
        cursor: '2026-10-08T00:00:00Z',
        publicKey: { keyId: 'k1', key: 'pub-key' },
        tickets: [],
      }),
    };
    controller = new ScannerController(mockService as ScannerService);
  });

  it('delegates getAssignedShowtimes to service with authenticated user', async () => {
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;

    await controller.getAssignedShowtimes(req);
    expect(mockService.getAssignedShowtimes).toHaveBeenCalledWith('user-1', ['STAFF']);
  });

  it('delegates getShowtimeTickets to service with params and user', async () => {
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;

    await controller.getShowtimeTickets('st-1', 'cursor-123', req);
    expect(mockService.getShowtimeTickets).toHaveBeenCalledWith('st-1', 'cursor-123', req.user);
  });

  it('delegates syncOfflineScans to service with body and user', async () => {
    mockService.syncOfflineScans = vi.fn().mockResolvedValue({
      showtimeId: 'st-1',
      totalReceived: 1,
      acceptedCount: 1,
      duplicateCount: 0,
      conflictCount: 0,
      results: [],
    });
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;
    const body = {
      scans: [
        {
          scanId: 's1',
          ticketCode: 'T1',
          gate: 'Gate A',
          scannedAt: '2026-10-13T10:00:00.000Z',
        },
      ],
    };

    await controller.syncOfflineScans('st-1', body, req);
    expect(mockService.syncOfflineScans).toHaveBeenCalledWith('st-1', body.scans, req.user);
  });

  it('delegates getShowtimeConflicts to service', async () => {
    mockService.getShowtimeConflicts = vi.fn().mockResolvedValue([]);
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;

    await controller.getShowtimeConflicts('st-1', req);
    expect(mockService.getShowtimeConflicts).toHaveBeenCalledWith('st-1', req.user);
  });

  it('delegates getRealtimeEntryStats to service', async () => {
    mockService.getRealtimeEntryStats = vi.fn().mockResolvedValue({
      showtimeId: 'st-1',
      totalTickets: 100,
      checkedInTickets: 50,
      remainingTickets: 50,
      entryRatePerMinute: 5,
      gateStats: [],
      updatedAt: '2026-10-13T10:00:00.000Z',
    });
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;

    await controller.getRealtimeEntryStats('st-1', req);
    expect(mockService.getRealtimeEntryStats).toHaveBeenCalledWith('st-1', req.user);
  });
});
