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
