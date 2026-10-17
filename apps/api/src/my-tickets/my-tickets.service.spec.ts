import { describe, expect, it, vi } from 'vitest';
import { MyTicketsService } from './my-tickets.service.js';

const NOW = new Date('2026-10-14T12:00:00.000Z');

function row(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'ticket-id',
    showtimeId: 'show-id',
    startTime: new Date('2026-10-20T12:00:00.000Z'),
    eventName: 'Event',
    seatLabel: 'A-1',
    categoryName: 'VIP',
    cancelled: false,
    used: false,
    ...overrides,
  };
}

function build(rows: unknown[]) {
  const db = { $queryRaw: vi.fn().mockResolvedValue(rows) };
  const crypto = { issueQr: vi.fn((id: string) => `QR-${id}`) };
  const service = new MyTicketsService(db as never, crypto as never);
  return { service, crypto };
}

describe('MyTicketsService.mineForOwner', () => {
  it('orders upcoming showtimes first, then past showtimes', async () => {
    const { service } = build([
      row({ id: 'past', startTime: new Date('2026-10-01T12:00:00.000Z') }),
      row({ id: 'later', startTime: new Date('2026-11-01T12:00:00.000Z') }),
      row({ id: 'soon', startTime: new Date('2026-10-20T12:00:00.000Z') }),
    ]);
    const { tickets } = await service.mineForOwner('user', NOW);
    expect(tickets.map((t) => t.ticketId)).toEqual(['soon', 'later', 'past']);
    expect(tickets.map((t) => t.upcoming)).toEqual([true, true, false]);
  });

  it('orders seats by seat label inside the same showtime', async () => {
    const { service } = build([
      row({ id: 'b', seatLabel: 'A-10' }),
      row({ id: 'a', seatLabel: 'A-2' }),
    ]);
    const { tickets } = await service.mineForOwner('user', NOW);
    expect(tickets.map((t) => t.seatLabel)).toEqual(['A-2', 'A-10']);
  });

  it('marks cancelled tickets without QR and issues QR for others', async () => {
    const { service, crypto } = build([
      row({ id: 'cancelled', cancelled: true }),
      row({ id: 'used', used: true }),
      row({ id: 'valid' }),
    ]);
    const { tickets } = await service.mineForOwner('user', NOW);
    const byId = Object.fromEntries(tickets.map((t) => [t.ticketId, t]));
    expect(byId.cancelled).toMatchObject({ status: 'CANCELLED', qrPayload: null });
    expect(byId.used).toMatchObject({ status: 'CHECKED_IN', qrPayload: 'QR-used' });
    expect(byId.valid).toMatchObject({ status: 'VALID', qrPayload: 'QR-valid' });
    expect(crypto.issueQr).toHaveBeenCalledTimes(2);
    expect(crypto.issueQr).not.toHaveBeenCalledWith('cancelled', expect.anything());
  });

  it('returns an empty list when the user has no paid tickets', async () => {
    const { service } = build([]);
    await expect(service.mineForOwner('user', NOW)).resolves.toEqual({ tickets: [] });
  });
});
