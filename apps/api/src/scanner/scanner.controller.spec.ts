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
        publicKeys: [{ keyId: 'k1', publicKey: 'pub-key', active: true }],
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
});
