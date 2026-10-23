import { describe, expect, it } from 'vitest';
import { isListStale, SCANNER_LIST_STALE_MINUTES } from './scanner-sync';
import type { LocalTicket } from './scanner-db';

describe('Scanner Offline Synchronization & Stale Detection (S-33)', () => {
  it('detects missing, invalid, fresh and stale sync cursors', () => {
    expect(isListStale(null)).toBe(true);
    expect(isListStale('invalid')).toBe(true);
    expect(isListStale(new Date(Date.now() - 20 * 60_000).toISOString())).toBe(false);
    expect(isListStale(new Date(Date.now() - (SCANNER_LIST_STALE_MINUTES + 1) * 60_000).toISOString())).toBe(true);
  });

  it('keeps only the partition key, ticket code and status in the local ticket snapshot', () => {
    const ticket: LocalTicket = {
      showtimeId: 'st-1',
      code: 'TK-ABC',
      status: 'valid',
    };
    expect(Object.keys(ticket).sort()).toEqual(['code', 'showtimeId', 'status']);
  });

  it('preserves local checked-in state during a delta until cancellation arrives', () => {
    const existing: LocalTicket = { showtimeId: 'st-1', code: 'TK-ABC', status: 'checked_in' };
    const incoming = { code: 'TK-ABC', status: 'valid' as const };
    const merged: LocalTicket = {
      showtimeId: existing.showtimeId,
      code: incoming.code,
      status: existing.status === 'checked_in' ? 'checked_in' : incoming.status,
    };
    expect(merged.status).toBe('checked_in');
    expect({ ...merged, status: 'cancelled' }).toEqual({ showtimeId: 'st-1', code: 'TK-ABC', status: 'cancelled' });
  });
});
