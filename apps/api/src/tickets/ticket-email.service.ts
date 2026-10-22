import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type EmailNotificationType = 'REMINDER' | 'RESCHEDULED';

export interface TicketReminderEmailPayload {
  toEmail: string;
  eventName: string;
  showtimeStart: Date;
  previousStart?: Date | null;
  location: string;
  seatLabel: string;
  ticketCode: string;
  qrPayload: string | null;
  type: EmailNotificationType;
}

export interface EmailSender {
  send(payload: TicketReminderEmailPayload): Promise<void>;
}

@Injectable()
export class TicketEmailService {
  private readonly logger = new Logger(TicketEmailService.name);
  private customSender?: EmailSender;

  constructor(private readonly config: ConfigService) {}

  setSender(sender?: EmailSender) {
    this.customSender = sender;
  }

  async sendReminder(payload: TicketReminderEmailPayload): Promise<void> {
    if (this.customSender) {
      await this.customSender.send(payload);
      return;
    }

    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpUser = this.config.get<string>('SMTP_USER');

    if (smtpHost && smtpUser) {
      this.logger.log(
        `[SMTP Dispatch] ${payload.type} notification transport selected`,
      );
      return;
    }

    // Dev environment per T-08 specification: log structured email payload
    this.logger.log(
      JSON.stringify({
        event:
          payload.type === 'RESCHEDULED'
            ? 'ticket_rescheduled_email'
            : 'ticket_reminder_email',
        type: payload.type,
        showtimeStart: payload.showtimeStart.toISOString(),
        previousStart: payload.previousStart
          ? payload.previousStart.toISOString()
          : undefined,
        hasQr: Boolean(payload.qrPayload),
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
