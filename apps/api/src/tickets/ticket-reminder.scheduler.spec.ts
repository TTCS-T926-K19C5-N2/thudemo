import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TicketReminderScheduler } from './ticket-reminder.scheduler.js';
import { TicketStatus, OrderStatus } from '@prisma/client';

describe('TicketReminderScheduler', () => {
  let db: any;
  let scheduler: TicketReminderScheduler;

  beforeEach(() => {
    db = {
      showtime: { findMany: vi.fn() },
      ticket: { findMany: vi.fn(), update: vi.fn() },
    };
    scheduler = new TicketReminderScheduler(db);
  });

  it('sweeps showtimes and sends reminders for tickets', async () => {
    db.showtime.findMany.mockResolvedValue([
      { id: 'showtime-1', startTime: new Date(), event: { name: 'Event 1', location: 'Loc 1' } }
    ]);
    db.ticket.findMany.mockResolvedValue([
      {
        id: 'ticket-1',
        showtimeId: 'showtime-1',
        seatLabel: 'A1',
        code: 'CODE1',
        status: TicketStatus.VALID,
        order: {
          user: { email: 'user@example.com' }
        }
      }
    ]);

    await scheduler.sweep();

    expect(db.showtime.findMany).toHaveBeenCalledTimes(1);
    expect(db.ticket.findMany).toHaveBeenCalledTimes(1);
    expect(db.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { reminderSentAt: expect.any(Date) },
    });
  });
});
