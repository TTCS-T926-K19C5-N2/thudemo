import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScannerController } from './scanner.controller.js';
import { ScannerService } from './scanner.service.js';
import { OfflineAdmissionsService } from './offline-admissions.service.js';
import { ScannerSnapshotService } from './scanner-snapshot.service.js';

describe('ScannerController', () => {
  let controller: ScannerController;
  let mockService: Partial<ScannerService>;
  const offline = {
    sync: vi.fn().mockResolvedValue({ results: [] }),
    conflicts: vi.fn(),
  };
  const snapshots = { snapshot: vi.fn() };

  beforeEach(() => {
    mockService = {
      getAssignedShowtimes: vi.fn().mockResolvedValue([]),
    };
    controller = new ScannerController(
      mockService as ScannerService,
      offline as unknown as OfflineAdmissionsService,
      snapshots as unknown as ScannerSnapshotService,
    );
  });

  it('delegates getAssignedShowtimes to service with authenticated user', async () => {
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;

    await controller.getAssignedShowtimes(req);
    expect(mockService.getAssignedShowtimes).toHaveBeenCalledWith('user-1', [
      'STAFF',
    ]);
  });

  it('delegates getShowtimeTickets to service with params and user', async () => {
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;

    await controller.getShowtimeTickets('st-1', 'cursor-123', req);
    expect(snapshots.snapshot).toHaveBeenCalledWith(
      'st-1',
      'cursor-123',
      req.user,
    );
  });

  it('delegates syncOfflineScans to service with body and user', async () => {
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;
    const body = {
      scans: [
        {
          scanId: 'scan-1',
          ticketCode: 'code-1',
          showtimeId: 'st-1',
          scannedAt: '2026-10-12T10:00:00Z',
          deviceId: 'dev-1',
        },
      ],
    };

    await controller.syncOfflineScans(body, req);
    expect(offline.sync).toHaveBeenCalledWith(body, req);
  });
});
