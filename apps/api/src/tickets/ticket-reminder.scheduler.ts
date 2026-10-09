import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketStatus, OrderStatus } from '@prisma/client';
import { encodeTicketQr } from './ticket-qr.js';

@Injectable()
export class TicketReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(TicketReminderScheduler.name);

  constructor(private readonly db: PrismaService) {}

  onModuleInit() {
    // Run every minute
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
    const now = new Date();
    // 24 hours from now
    const targetStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    // 24 hours + 10 minutes from now
    const targetEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 10 * 60 * 1000);

    // Find showtimes starting in exactly ~24 hours
    const showtimes = await this.db.showtime.findMany({
      where: {
        startTime: {
          gte: targetStart,
          lte: targetEnd,
        },
      },
      include: {
        event: true,
      },
    });

    if (showtimes.length === 0) return;

    for (const showtime of showtimes) {
      // Find all valid tickets for this showtime that haven't been reminded yet
      const tickets = await this.db.ticket.findMany({
        where: {
          showtimeId: showtime.id,
          status: TicketStatus.VALID,
          reminderSentAt: null,
          order: {
            status: OrderStatus.PAID,
          },
        },
        include: {
          order: {
            include: { user: true },
          },
        },
        take: 100, // Process in batches
      });

      for (const ticket of tickets) {
        if (!ticket.order?.user?.email) continue;
        
        const email = ticket.order.user.email;
        const qrPayload = ticket.keyId && ticket.signature
          ? encodeTicketQr({
              keyId: ticket.keyId,
              code: ticket.code,
              showtimeId: ticket.showtimeId,
              signature: ticket.signature,
            })
          : null;

        // Mock sending email
        this.logger.log(
          `SEND EMAIL to ${email}: Nhắc nhở suất diễn "${showtime.event.name}" lúc ${showtime.startTime.toISOString()}. Venue: ${showtime.event.location}. Ticket: ${ticket.seatLabel}. QR: ${qrPayload ? 'Yes' : 'No'}`
        );

        // Mark as sent
        await this.db.ticket.update({
          where: { id: ticket.id },
          data: { reminderSentAt: new Date() },
        });
      }
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
