import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScannerController } from './scanner.controller.js';
import type { ScannerService } from './scanner.service.js';
import type { OfflineAdmissionsService } from './offline-admissions.service.js';
import type { ScannerSnapshotService } from './scanner-snapshot.service.js';

describe('ScannerController', () => {
  let controller: ScannerController;
  let mockService: Partial<ScannerService>;
  let mockOffline: Partial<OfflineAdmissionsService>;
  let mockSnapshots: Partial<ScannerSnapshotService>;

  beforeEach(() => {
    mockService = {
      getAssignedShowtimes: vi.fn().mockResolvedValue([]),
    };
    mockSnapshots = {
      snapshot: vi.fn().mockResolvedValue({
        showtimeId: 'st-1',
        showtimeName: 'Show 1',
        generatedAt: '2026-10-08T00:00:00Z',
        cursor: '2026-10-08T00:00:00Z',
        publicKeys: [{ keyId: 'k1', publicKey: 'pub-key', active: true }],
        tickets: [],
      } as any),
    };
    mockOffline = {
      sync: vi.fn().mockResolvedValue({ admissions: [], conflicts: [] } as any),
      conflicts: vi.fn().mockResolvedValue({ items: [], total: 0 } as any),
    };
    controller = new ScannerController(
      mockService as ScannerService,
      mockOffline as OfflineAdmissionsService,
      mockSnapshots as ScannerSnapshotService,
    );
  });

  it('delegates getAssignedShowtimes to service with authenticated user', async () => {
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;

    await controller.getAssignedShowtimes(req);
    expect(mockService.getAssignedShowtimes).toHaveBeenCalledWith('user-1', ['STAFF']);
  });

  it('delegates getShowtimeTickets to snapshots with params and user', async () => {
    const req = {
      user: { id: 'user-1', email: 'user@test.com', roles: ['STAFF'] },
    } as any;

    await controller.getShowtimeTickets('st-1', 'cursor-123', req);
    expect(mockSnapshots.snapshot).toHaveBeenCalledWith('st-1', 'cursor-123', req.user);
  });

  it('delegates syncOfflineScans to offline service with body and req', async () => {
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
    expect(mockOffline.sync).toHaveBeenCalledWith(body, req);
  });
});

