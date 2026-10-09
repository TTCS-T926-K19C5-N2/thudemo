import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketStatus, OrderStatus } from '@prisma/client';
import { encodeTicketQr } from './ticket-qr.js';
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
    // Run initial sweep, then repeat every minute
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
        const email = (ticket as any).ownerEmail || ticket.order?.user?.email;
        if (!email) continue;

        const qrPayload =
          ticket.keyId && ticket.signature
            ? encodeTicketQr({
                keyId: ticket.keyId,
                code: ticket.code,
                showtimeId: ticket.showtimeId,
                signature: ticket.signature,
              })
            : null;

        try {
          // Send email via TicketEmailService
          await this.emailService.sendReminder({
            toEmail: email,
            eventName: showtime.event.name,
            showtimeStart: showtime.startTime,
            location: showtime.event.location,
            seatLabel: ticket.seatLabel,
            ticketCode: ticket.code,
            qrPayload,
          });

          // ONLY mark reminderSentAt if email dispatch succeeded
          await this.db.ticket.update({
            where: { id: ticket.id },
            data: { reminderSentAt: new Date() },
          });
        } catch (error) {
          // Failure: do NOT mark reminderSentAt, so subsequent sweep retries
          this.logger.error(
            `Failed to send reminder email for ticket ${ticket.id} to ${email}: ${(error as Error).message}`,
          );
        }
      }
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
