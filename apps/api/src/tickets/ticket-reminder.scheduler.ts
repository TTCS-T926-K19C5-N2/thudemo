import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketStatus, OrderStatus } from '@prisma/client';
import { TicketEmailService } from './ticket-email.service.js';

@Injectable()
export class TicketReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(TicketReminderScheduler.name);

  constructor(
    private readonly db: PrismaService,
    private readonly emailService: TicketEmailService,
  ) {}

  onModuleInit() {
    this.tick();
    this.timer = setInterval(() => this.tick(), 60000);
  }

  private tick() {
    if (this.running) return;
    this.running = this.sweep()
      .catch((e) => this.logger.error('Failed to run ticket reminder sweep', e))
      .finally(() => {
        this.running = undefined;
      });
  }

  async sweep() {
    await this.sweepReminders();
    await this.sweepRescheduled();
  }

  /**
   * AC: Email nhắc gửi 24 giờ trước suất kèm vé và chỉ dẫn địa điểm.
   */
  async sweepReminders() {
    const now = new Date();
    const targetEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find future showtimes starting within the next 24 hours
    const showtimes = await this.db.showtime.findMany({
      where: {
        startTime: {
          gt: now,
          lte: targetEnd,
        },
      },
      include: {
        event: true,
      },
    });

    for (const showtime of showtimes) {
      // Find all valid tickets that haven't been reminded yet
      const tickets = await this.db.ticket.findMany({
        where: {
          showtimeId: showtime.id,
          status: TicketStatus.VALID,
          remindedStartTime: null,
          order: {
            status: OrderStatus.PAID,
          },
        },
        include: {
          order: {
            include: { user: true },
          },
        },
        take: 100,
      });

      for (const ticket of tickets) {
        const email = ticket.ownerEmail || ticket.order?.user?.email;
        if (!email) continue;

        try {
          await this.emailService.sendReminder({
            orderId: ticket.orderId!,
            ticketId: ticket.id,
            showtimeStart: showtime.startTime,
            scheduleVersion: showtime.updatedAt,
            location: showtime.event.location,
            type: 'REMINDER',
          });

          // The durable outbox owns delivery/retry; enqueue is not SMTP receipt.
          await this.db.ticket.update({
            where: { id: ticket.id },
            data: {
              reminderSentAt: null,
              remindedStartTime: showtime.startTime,
            },
          });
        } catch {
          // Failure: do NOT update remindedStartTime to allow retry on next sweep
          this.logger.error(
            `Reminder delivery failed for ticket ${ticket.id}; retry deferred`,
          );
        }
      }
    }
  }

  /**
   * AC: Đổi giờ diễn thì gửi email cập nhật.
   * Quét các vé đã từng nhận nhắc nhở nhưng giờ diễn thực tế của showtime đã thay đổi khác với remindedStartTime.
   */
  async sweepRescheduled() {
    // Find tickets that have already received a reminder but whose showtime startTime has changed
    let cursor: string | undefined;
    while (true) {
      const tickets = await this.db.ticket.findMany({
        where: {
          status: TicketStatus.VALID,
          remindedStartTime: { not: null },
          order: {
            status: OrderStatus.PAID,
          },
        },
        include: {
          showtime: {
            include: { event: true },
          },
          order: {
            include: { user: true },
          },
        },
        take: 100,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      for (const ticket of tickets) {
        if (!ticket.showtime || !ticket.remindedStartTime) continue;

        // Detect showtime start time change
        if (
          ticket.showtime.startTime.getTime() !==
          ticket.remindedStartTime.getTime()
        ) {
          const email = ticket.ownerEmail || ticket.order?.user?.email;
          if (!email) continue;

          try {
            await this.emailService.sendReminder({
              orderId: ticket.orderId!,
              ticketId: ticket.id,
              showtimeStart: ticket.showtime.startTime,
              scheduleVersion: ticket.showtime.updatedAt,
              previousStart: ticket.remindedStartTime,
              location: ticket.showtime.event.location,
              type: 'RESCHEDULED',
            });

            // Record the scheduled version; the worker alone records sentAt.
            await this.db.ticket.update({
              where: { id: ticket.id },
              data: {
                reminderSentAt: null,
                remindedStartTime: ticket.showtime.startTime,
              },
            });
          } catch {
            this.logger.error(
              `Reschedule delivery failed for ticket ${ticket.id}; retry deferred`,
            );
          }
        }
      }
      if (tickets.length < 100) break;
      cursor = tickets[tickets.length - 1].id;
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
