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
          await this.emailService.sendReminder({
            toEmail: email,
            eventName: showtime.event.name,
            showtimeStart: showtime.startTime,
            location: showtime.event.location,
            seatLabel: ticket.seatLabel,
            ticketCode: ticket.code,
            qrPayload,
            type: 'REMINDER',
          });

          // Idempotency: mark both reminderSentAt and remindedStartTime
          await this.db.ticket.update({
            where: { id: ticket.id },
            data: {
              reminderSentAt: new Date(),
              remindedStartTime: showtime.startTime,
            },
          });
        } catch (error) {
          // Failure: do NOT update remindedStartTime to allow retry on next sweep
          this.logger.error(
            `Failed to send reminder email for ticket ${ticket.id} to ${email}: ${(error as Error).message}`,
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
    });

    for (const ticket of tickets) {
      if (!ticket.showtime || !ticket.remindedStartTime) continue;

      // Detect showtime start time change
      if (ticket.showtime.startTime.getTime() !== ticket.remindedStartTime.getTime()) {
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
          await this.emailService.sendReminder({
            toEmail: email,
            eventName: ticket.showtime.event.name,
            showtimeStart: ticket.showtime.startTime,
            previousStart: ticket.remindedStartTime,
            location: ticket.showtime.event.location,
            seatLabel: ticket.seatLabel,
            ticketCode: ticket.code,
            qrPayload,
            type: 'RESCHEDULED',
          });

          // Idempotency: update remindedStartTime to the new startTime
          await this.db.ticket.update({
            where: { id: ticket.id },
            data: {
              reminderSentAt: new Date(),
              remindedStartTime: ticket.showtime.startTime,
            },
          });
        } catch (error) {
          this.logger.error(
            `Failed to send rescheduled email for ticket ${ticket.id} to ${email}: ${(error as Error).message}`,
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
