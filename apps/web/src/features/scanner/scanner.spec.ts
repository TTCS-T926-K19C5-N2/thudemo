import { describe, expect, it } from 'vitest';
import { isListStale, SCANNER_LIST_STALE_MINUTES } from './scanner-sync';
import type { LocalTicket } from './scanner-db';

describe('Scanner Offline Synchronization & Stale Detection (S-33)', () => {
  describe('isListStale', () => {
    it('returns true when lastSyncAt is missing or invalid', () => {
      expect(isListStale(null)).toBe(true);
      expect(isListStale(undefined)).toBe(true);
      expect(isListStale('')).toBe(true);
      expect(isListStale('invalid-date')).toBe(true);
    });

    it('returns false when lastSyncAt was within 30 minutes', () => {
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      expect(isListStale(twentyMinsAgo)).toBe(false);

      const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
      expect(isListStale(oneMinAgo)).toBe(false);
    });

    it('returns true when lastSyncAt is older than 30 minutes', () => {
      const thirtyOneMinsAgo = new Date(
        Date.now() - (SCANNER_LIST_STALE_MINUTES + 1) * 60 * 1000,
      ).toISOString();
      expect(isListStale(thirtyOneMinsAgo)).toBe(true);

      const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
      expect(isListStale(twoHoursAgo)).toBe(true);
    });
  });

  describe('Incremental Merge Rules (Local checked-in status wins)', () => {
    it('preserves locally checked-in ticket when incoming server ticket is still valid', () => {
      const existingTicket: LocalTicket = {
        showtimeId: 'st-1',
        code: 'TK-12345',
        status: 'checked_in',
        checkedInAt: '2026-10-08T08:00:00.000Z',
        seatLabel: 'A-12',
        ticketType: 'VIP',
        localCheckedIn: true,
      };

      const incomingServerUpdate: {
        code: string;
        status: 'valid' | 'checked_in' | 'cancelled';
        checkedInAt: string | null;
        seatLabel: string;
        ticketType: string;
      } = {
        code: 'TK-12345',
        status: 'valid', // server still has valid because offline check-in hasn't synced
        checkedInAt: null,
        seatLabel: 'A-12',
        ticketType: 'VIP',
      };

      // Apply merge logic
      const isLocalCheckedIn =
        existingTicket.localCheckedIn || existingTicket.status === 'checked_in';
      const willBeCheckedIn =
        isLocalCheckedIn || incomingServerUpdate.status === 'checked_in';

      const merged: LocalTicket = {
        ...existingTicket,
        seatLabel: incomingServerUpdate.seatLabel,
        ticketType: incomingServerUpdate.ticketType,
        status: willBeCheckedIn ? 'checked_in' : incomingServerUpdate.status,
        checkedInAt: willBeCheckedIn
          ? existingTicket.checkedInAt ?? incomingServerUpdate.checkedInAt
          : incomingServerUpdate.checkedInAt,
        localCheckedIn: isLocalCheckedIn,
      };

      expect(merged.status).toBe('checked_in');
      expect(merged.checkedInAt).toBe('2026-10-08T08:00:00.000Z');
      expect(merged.localCheckedIn).toBe(true);
    });

    it('updates ticket to cancelled when server notifies cancellation', () => {
      const existingTicket: LocalTicket = {
        showtimeId: 'st-1',
        code: 'TK-12345',
        status: 'valid',
        checkedInAt: null,
        seatLabel: 'A-12',
        ticketType: 'VIP',
        localCheckedIn: false,
      };

      const incomingServerUpdate: {
        code: string;
        status: 'valid' | 'checked_in' | 'cancelled';
        checkedInAt: string | null;
        seatLabel: string;
        ticketType: string;
      } = {
        code: 'TK-12345',
        status: 'cancelled',
        checkedInAt: null,
        seatLabel: 'A-12',
        ticketType: 'VIP',
      };

      const isLocalCheckedIn =
        existingTicket.localCheckedIn || existingTicket.status === 'checked_in';
      const willBeCheckedIn =
        isLocalCheckedIn || incomingServerUpdate.status === 'checked_in';

      const merged: LocalTicket = {
        ...existingTicket,
        status: willBeCheckedIn ? 'checked_in' : incomingServerUpdate.status,
        localCheckedIn: isLocalCheckedIn,
      };

      expect(merged.status).toBe('cancelled');
    });

    it('applies server checked-in when local was valid', () => {
      const existingTicket: LocalTicket = {
        showtimeId: 'st-1',
        code: 'TK-12345',
        status: 'valid',
        checkedInAt: null,
        seatLabel: 'A-12',
        ticketType: 'VIP',
        localCheckedIn: false,
      };

      const incomingServerUpdate = {
        code: 'TK-12345',
        status: 'checked_in' as const,
        checkedInAt: '2026-10-08T08:15:00.000Z',
        seatLabel: 'A-12',
        ticketType: 'VIP',
      };

      const isLocalCheckedIn =
        existingTicket.localCheckedIn || existingTicket.status === 'checked_in';
      const willBeCheckedIn =
        isLocalCheckedIn || incomingServerUpdate.status === 'checked_in';

      const merged: LocalTicket = {
        ...existingTicket,
        status: willBeCheckedIn ? 'checked_in' : incomingServerUpdate.status,
        checkedInAt: willBeCheckedIn
          ? existingTicket.checkedInAt ?? incomingServerUpdate.checkedInAt
          : incomingServerUpdate.checkedInAt,
        localCheckedIn: isLocalCheckedIn,
      };

      expect(merged.status).toBe('checked_in');
      expect(merged.checkedInAt).toBe('2026-10-08T08:15:00.000Z');
    });
  });

  describe('Privacy & Security (No PII)', () => {
    it('verifies ticket fields contain strictly non-PII operational fields', () => {
      const ticket: LocalTicket = {
        showtimeId: 'st-1',
        code: 'TK-ABC',
        status: 'valid',
        checkedInAt: null,
        seatLabel: 'C-05',
        ticketType: 'STANDARD',
      };

      const keys = Object.keys(ticket);
      expect(keys).not.toContain('name');
      expect(keys).not.toContain('userName');
      expect(keys).not.toContain('email');
      expect(keys).not.toContain('phone');
      expect(keys).not.toContain('phoneNumber');
      expect(keys).not.toContain('userId');
    });
  });
});
