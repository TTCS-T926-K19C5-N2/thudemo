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
      showtime: { findMany: vi.fn() },
      ticket: { findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    };
    const config = { get: vi.fn().mockReturnValue(undefined) } as any;
    emailService = new TicketEmailService(config);
    vi.spyOn(emailService, 'sendReminder').mockResolvedValue(undefined);
    scheduler = new TicketReminderScheduler(db, emailService);
  });

  it('selects future showtimes within 24 hours and dispatches reminders to email service', async () => {
    const showtimeStart = new Date(Date.now() + 20 * 60 * 60 * 1000);
    db.showtime.findMany.mockResolvedValue([
      {
        id: 'showtime-1',
        startTime: showtimeStart,
        event: { name: 'Concert A', location: 'Opera House' },
      },
    ]);
    db.ticket.findMany.mockResolvedValue([
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

    expect(db.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          showtimeId: 'showtime-1',
          status: TicketStatus.VALID,
          reminderSentAt: null,
        }),
      }),
    );

    expect(emailService.sendReminder).toHaveBeenCalledWith({
      toEmail: 'buyer@example.com',
      eventName: 'Concert A',
      showtimeStart,
      location: 'Opera House',
      seatLabel: 'VIP-1',
      ticketCode: 'TK-11111-22222',
      qrPayload: expect.stringContaining('TK-11111-22222'),
    });

    expect(db.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('does NOT mark reminderSentAt if email provider dispatch fails, enabling retry on subsequent sweeps', async () => {
    db.showtime.findMany.mockResolvedValue([
      {
        id: 'showtime-1',
        startTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
        event: { name: 'Concert B', location: 'Hall B' },
      },
    ]);
    db.ticket.findMany.mockResolvedValue([
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
    // Crucial: do NOT mark reminderSentAt when sending fails
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it('prefers ownerEmail if ticket has been transferred', async () => {
    db.showtime.findMany.mockResolvedValue([
      {
        id: 'showtime-1',
        startTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
        event: { name: 'Show C', location: 'Arena' },
      },
    ]);
    db.ticket.findMany.mockResolvedValue([
      {
        id: 'ticket-transferred',
        showtimeId: 'showtime-1',
        seatLabel: 'B-5',
        code: 'TK-55555-66666',
        status: TicketStatus.VALID,
        ownerEmail: 'transferee@example.com',
        order: { user: { email: 'originalbuyer@example.com' } },
      },
    ]);

    await scheduler.sweep();

    expect(emailService.sendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'transferee@example.com',
      }),
    );
  });
});
