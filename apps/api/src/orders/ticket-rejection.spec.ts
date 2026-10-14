import { describe, expect, it, vi } from 'vitest';
import { metrics } from '../monitoring/metrics.js';
import {
  cancelledTicket,
  isValidUuid,
  notEligibleTicket,
  TICKET_REJECTION,
  ticketNotFound,
  unknownTicket,
  wrongShowtime,
  type RejectionContext,
} from './ticket-rejection.js';

describe('S-39 Ticket rejection semantics, logging and metrics', () => {
  const ctx: RejectionContext = {
    showtimeId: '11111111-1111-4111-8111-111111111111',
    gateId: '22222222-2222-4222-8222-222222222222',
    staffId: '33333333-3333-4333-8333-333333333333',
    requestId: '44444444-4444-4444-8444-444444444444',
    ticketId: '55555555-5555-4555-8555-555555555555',
  };

  it('validates UUID syntax safely before DB casting', () => {
    expect(isValidUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isValidUuid('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(false); // invalid variant/version digit
    expect(isValidUuid('22222222-2222-4222-8222-222222222222'.toUpperCase())).toBe(true);
    expect(isValidUuid("'; DROP TABLE showtimes; --")).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(123)).toBe(false);
  });

  it('handles unknown ticket with structured reason and counter increment', async () => {
    const metricSpy = vi.spyOn(metrics, 'rejectTicketScan');
    const err = unknownTicket(ctx);
    expect(err.getStatus()).toBe(400);
    const response = err.getResponse() as Record<string, unknown>;
    expect(response).toEqual({
      code: 'INVALID_QR_SIGNATURE',
      reasonCode: TICKET_REJECTION.UNKNOWN,
      message: 'Không phải vé của hệ thống.',
    });
    expect(metricSpy).toHaveBeenCalledWith(TICKET_REJECTION.UNKNOWN);
  });

  it('returns 404 INVALID_TICKET when signed ticket is not found in DB', async () => {
    const metricSpy = vi.spyOn(metrics, 'rejectTicketScan');
    const err = ticketNotFound(ctx);
    expect(err.getStatus()).toBe(404);
    expect(err.getResponse()).toEqual({
      code: 'INVALID_TICKET',
      reasonCode: TICKET_REJECTION.UNKNOWN,
      message: 'Không phải vé của hệ thống.',
    });
    expect(metricSpy).toHaveBeenCalledWith(TICKET_REJECTION.UNKNOWN);
  });

  it('handles wrong showtime with localized time and structured showtime info', async () => {
    const metricSpy = vi.spyOn(metrics, 'rejectTicketScan');
    const startTime = new Date('2026-12-25T13:00:00.000Z');
    const err = wrongShowtime(ctx, {
      eventName: 'Hòa Nhạc Giáng Sinh',
      startTime,
    });
    expect(err.getStatus()).toBe(400);
    const response = err.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('WRONG_SHOWTIME');
    expect(response.reasonCode).toBe(TICKET_REJECTION.WRONG_SHOWTIME);
    expect(response.message).toContain('Hòa Nhạc Giáng Sinh');
    expect(response.message).toContain('20:00:00 25/12/2026');
    expect(response.ticketShowtime).toEqual({
      eventName: 'Hòa Nhạc Giáng Sinh',
      startTime: startTime.toISOString(),
    });
    expect(metricSpy).toHaveBeenCalledWith(TICKET_REJECTION.WRONG_SHOWTIME);
  });

  it('handles cancelled ticket with date when available', async () => {
    const metricSpy = vi.spyOn(metrics, 'rejectTicketScan');
    const cancelledAt = new Date('2026-11-15T09:30:00.000Z');
    const err = cancelledTicket(ctx, cancelledAt);
    expect(err.getStatus()).toBe(404);
    const response = err.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('INVALID_TICKET');
    expect(response.reasonCode).toBe(TICKET_REJECTION.CANCELLED);
    expect(response.message).toBe('Vé đã huỷ ngày 15/11/2026.');
    expect(response.cancelledAt).toBe(cancelledAt.toISOString());
    expect(metricSpy).toHaveBeenCalledWith(TICKET_REJECTION.CANCELLED);
  });

  it('handles cancelled ticket without date fallback (returns general message)', async () => {
    const metricSpy = vi.spyOn(metrics, 'rejectTicketScan');
    const err = cancelledTicket(ctx, null);
    expect(err.getStatus()).toBe(404);
    const response = err.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('INVALID_TICKET');
    expect(response.reasonCode).toBe(TICKET_REJECTION.CANCELLED);
    expect(response.message).toBe('Vé đã huỷ.');
    expect(response.cancelledAt).toBeNull();
    expect(metricSpy).toHaveBeenCalledWith(TICKET_REJECTION.CANCELLED);
  });

  it('handles not eligible unpaid ticket with distinct code and counter', async () => {
    const metricSpy = vi.spyOn(metrics, 'rejectTicketScan');
    const err = notEligibleTicket(ctx);
    expect(err.getStatus()).toBe(404);
    const response = err.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('INVALID_TICKET');
    expect(response.reasonCode).toBe(TICKET_REJECTION.NOT_ELIGIBLE);
    expect(response.message).toBe('Vé chưa đủ điều kiện vào.');
    expect(metricSpy).toHaveBeenCalledWith(TICKET_REJECTION.NOT_ELIGIBLE);
  });
});
