import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TicketReminderScheduler } from './ticket-reminder.scheduler.js';
import { TicketEmailService } from './ticket-email.service.js';
import { TicketStatus } from '@prisma/client';

describe('TicketReminderScheduler', () => {
  let db: any;
  let emailService: TicketEmailService;
  let scheduler: TicketReminderScheduler;

  beforeEach(() => {
    db = {
      showtime: { findMany: vi.fn().mockResolvedValue([]) },
      ticket: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
    };
    const config = { get: vi.fn().mockReturnValue(undefined) } as any;
    emailService = new TicketEmailService(config);
    vi.spyOn(emailService, 'sendReminder').mockResolvedValue(undefined);
    scheduler = new TicketReminderScheduler(db, emailService);
  });

  it('does not start a second legacy mail worker at application startup', async () => {
    const sweep = vi.spyOn(scheduler, 'sweep');
    scheduler.onModuleInit();
    await Promise.resolve();
    expect(sweep).not.toHaveBeenCalled();
    await scheduler.onModuleDestroy();
  });

  it('sends past the old 100-ticket cap using bounded keyset pages', async () => {
    db.showtime.findMany.mockResolvedValueOnce([{
      id: 'showtime-1',
      startTime: new Date(Date.now() + 60_000),
      event: { name: 'Concert', location: 'Hall' },
    }]);
    const row = (id: number) => ({
      id: `ticket-${String(id).padStart(3, '0')}`,
      showtimeId: 'showtime-1',
      seatLabel: `A-${id}`,
      code: `TK-${id}`,
      status: TicketStatus.VALID,
      order: { user: { email: `buyer${id}@example.invalid` } },
    });
    db.ticket.findMany
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => row(i + 1)))
      .mockResolvedValueOnce([row(101)])
      .mockResolvedValueOnce([]);
    const send = vi.spyOn(emailService, 'sendReminder').mockResolvedValue(undefined);
    await scheduler.sweepReminders();
    expect(send).toHaveBeenCalledTimes(101);
    expect(db.ticket.findMany).toHaveBeenCalledTimes(3);
  });

  describe('sweepReminders (24h before showtime)', () => {
    it('selects future showtimes within 24 hours and dispatches reminders to email service', async () => {
      const showtimeStart = new Date(Date.now() + 20 * 60 * 60 * 1000);
      db.showtime.findMany.mockResolvedValueOnce([
        {
          id: 'showtime-1',
          startTime: showtimeStart,
          event: { name: 'Concert A', location: 'Opera House' },
        },
      ]);
      db.ticket.findMany.mockResolvedValueOnce([
        {
          id: 'ticket-1',
          showtimeId: 'showtime-1',
          seatLabel: 'VIP-1',
          code: 'TK-11111-22222',
          status: TicketStatus.VALID,
          keyId: 'k1',
          signature: 'sig1',
          order: {
            user: { email: 'buyer@example.com' },
          },
        },
      ]);

      await scheduler.sweep();

      expect(db.showtime.findMany).toHaveBeenCalledWith({
        where: {
          startTime: {
            gt: expect.any(Date),
            lte: expect.any(Date),
          },
        },
        include: { event: true },
      });

      expect(emailService.sendReminder).toHaveBeenCalledWith({
        toEmail: 'buyer@example.com',
        eventName: 'Concert A',
        showtimeStart,
        location: 'Opera House',
        seatLabel: 'VIP-1',
        ticketCode: 'TK-11111-22222',
        qrPayload: expect.stringContaining('TK-11111-22222'),
        type: 'REMINDER',
      });

      expect(db.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: {
          reminderSentAt: expect.any(Date),
          remindedStartTime: showtimeStart,
        },
      });
    });

    it('sends a reminder to the current owner of a transferred ticket', async () => {
      const showtimeStart = new Date(Date.now() + 12 * 60 * 60 * 1000);
      db.showtime.findMany.mockResolvedValueOnce([
        {
          id: 'showtime-transfer',
          startTime: showtimeStart,
          event: { name: 'Transferred show', location: 'Hall T' },
        },
      ]);
      db.ticket.findMany.mockResolvedValueOnce([
        {
          id: 'ticket-transferred',
          showtimeId: 'showtime-transfer',
          seatLabel: 'B-2',
          code: 'TK-TRANSFER-1',
          status: TicketStatus.VALID,
          ownerEmail: 'recipient@example.invalid',
          order: null,
        },
      ]);

      await scheduler.sweepReminders();

      expect(db.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                orderId: null,
                logs: { some: { action: 'ISSUED_FROM_TRANSFER' } },
              },
            ]),
          }),
        }),
      );
      expect(emailService.sendReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: 'recipient@example.invalid',
          ticketCode: 'TK-TRANSFER-1',
          type: 'REMINDER',
        }),
      );
    });

    it('does NOT mark remindedStartTime if email provider dispatch fails, enabling retry on subsequent sweeps', async () => {
      db.showtime.findMany.mockResolvedValueOnce([
        {
          id: 'showtime-1',
          startTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
          event: { name: 'Concert B', location: 'Hall B' },
        },
      ]);
      db.ticket.findMany.mockResolvedValueOnce([
        {
          id: 'ticket-fail',
          showtimeId: 'showtime-1',
          seatLabel: 'A-2',
          code: 'TK-33333-44444',
          status: TicketStatus.VALID,
          order: { user: { email: 'buyer2@example.com' } },
        },
      ]);

      vi.spyOn(emailService, 'sendReminder').mockRejectedValueOnce(new Error('SMTP Connection timeout'));

      await scheduler.sweep();

      expect(emailService.sendReminder).toHaveBeenCalledTimes(1);
      // Crucial: do NOT mark remindedStartTime when sending fails
      expect(db.ticket.update).not.toHaveBeenCalled();
    });
  });

  describe('sweepRescheduled (AC: đổi giờ diễn thì gửi email cập nhật)', () => {
    it('detects rescheduled showtimes and sends update emails with new time', async () => {
      const oldStartTime = new Date('2026-11-01T19:00:00Z');
      const newStartTime = new Date('2026-11-01T20:30:00Z');

      // sweepReminders returns empty
      db.showtime.findMany.mockResolvedValueOnce([]);

      // sweepRescheduled finds ticket whose showtime has changed
      db.ticket.findMany.mockResolvedValueOnce([
        {
          id: 'ticket-rescheduled-1',
          showtimeId: 'showtime-1',
          seatLabel: 'C-10',
          code: 'TK-77777-88888',
          status: TicketStatus.VALID,
          remindedStartTime: oldStartTime,
          keyId: 'k1',
          signature: 'sig1',
          showtime: {
            id: 'showtime-1',
            startTime: newStartTime,
            event: { name: 'Vở kịch Mùa Thu', location: 'Nhà hát Lớn' },
          },
          order: {
            user: { email: 'customer@example.com' },
          },
        },
      ]);

      await scheduler.sweep();

      expect(emailService.sendReminder).toHaveBeenCalledWith({
        toEmail: 'customer@example.com',
        eventName: 'Vở kịch Mùa Thu',
        showtimeStart: newStartTime,
        previousStart: oldStartTime,
        location: 'Nhà hát Lớn',
        seatLabel: 'C-10',
        ticketCode: 'TK-77777-88888',
        qrPayload: expect.stringContaining('TK-77777-88888'),
        type: 'RESCHEDULED',
      });

      expect(db.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-rescheduled-1' },
        data: {
          reminderSentAt: expect.any(Date),
          remindedStartTime: newStartTime,
        },
      });
    });

    it('sends reschedule notices to the current owner of a transferred ticket', async () => {
      const oldStartTime = new Date('2026-11-01T19:00:00Z');
      const newStartTime = new Date('2026-11-01T20:30:00Z');
      db.ticket.findMany.mockResolvedValueOnce([
        {
          id: 'ticket-transferred-rescheduled',
          showtimeId: 'showtime-transfer',
          seatLabel: 'B-2',
          code: 'TK-TRANSFER-RESCHEDULED',
          status: TicketStatus.VALID,
          ownerEmail: 'recipient@example.invalid',
          remindedStartTime: oldStartTime,
          order: null,
          showtime: {
            id: 'showtime-transfer',
            startTime: newStartTime,
            event: { name: 'Transferred show', location: 'Hall T' },
          },
        },
      ]);

      await scheduler.sweepRescheduled();

      expect(db.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                orderId: null,
                logs: { some: { action: 'ISSUED_FROM_TRANSFER' } },
              },
            ]),
          }),
        }),
      );
      expect(emailService.sendReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: 'recipient@example.invalid',
          ticketCode: 'TK-TRANSFER-RESCHEDULED',
          previousStart: oldStartTime,
          showtimeStart: newStartTime,
          type: 'RESCHEDULED',
        }),
      );
    });

    it('does NOT re-send if showtime start time matches remindedStartTime (idempotent)', async () => {
      const currentTime = new Date('2026-11-01T19:00:00Z');

      db.showtime.findMany.mockResolvedValueOnce([]);
      db.ticket.findMany.mockResolvedValueOnce([
        {
          id: 'ticket-same-time',
          showtimeId: 'showtime-1',
          remindedStartTime: currentTime,
          showtime: {
            id: 'showtime-1',
            startTime: currentTime, // Exactly matching
            event: { name: 'Show', location: 'Hall' },
          },
          order: { user: { email: 'cust@example.com' } },
        },
      ]);

      await scheduler.sweep();

      expect(emailService.sendReminder).not.toHaveBeenCalled();
      expect(db.ticket.update).not.toHaveBeenCalled();
    });
  });
});
