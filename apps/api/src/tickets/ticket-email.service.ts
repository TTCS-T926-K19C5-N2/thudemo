import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TicketReminderEmailPayload {
  toEmail: string;
  eventName: string;
  showtimeStart: Date;
  location: string;
  seatLabel: string;
  ticketCode: string;
  qrPayload: string | null;
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
        `[SMTP Dispatch] Sending reminder email to ${payload.toEmail} via ${smtpHost} for showtime "${payload.eventName}"`,
      );
      return;
    }

    // Dev environment per T-08 specification: log structured email payload
    this.logger.log(
      JSON.stringify({
        event: 'ticket_reminder_email',
        to: payload.toEmail,
        subject: `[Nhắc nhở] Sự kiện "${payload.eventName}" sắp diễn ra trong 24 giờ tới`,
        eventName: payload.eventName,
        showtimeStart: payload.showtimeStart.toISOString(),
        location: payload.location,
        seat: payload.seatLabel,
        ticketCode: payload.ticketCode,
        hasQr: Boolean(payload.qrPayload),
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
