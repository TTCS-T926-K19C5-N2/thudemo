import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { MailService } from '../mail/mail.service.js';
import { TICKET_MAIL_TRANSPORT } from './ticket-mail-transport.js';

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

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
      character
    ]!,
  );

@Injectable()
export class TicketEmailService {
  private readonly logger = new Logger(TicketEmailService.name);
  private customSender?: EmailSender;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(TICKET_MAIL_TRANSPORT) private readonly transport?: MailService,
  ) {}

  setSender(sender?: EmailSender) {
    this.customSender = sender;
  }

  async sendReminder(payload: TicketReminderEmailPayload): Promise<void> {
    if (this.customSender) {
      await this.customSender.send(payload);
      return;
    }
    if (this.config.get<string>('TICKET_MAIL_MODE') === 'off' || !this.transport?.ready)
      throw new ServiceUnavailableException('Dịch vụ email chưa sẵn sàng.');

    const id = randomUUID();
    const title = payload.type === 'RESCHEDULED' ? 'Thông báo đổi giờ diễn' : 'Nhắc lịch diễn';
    const lines = [
      title,
      payload.eventName,
      `Giờ diễn: ${payload.showtimeStart.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
      ...(payload.previousStart
        ? [`Giờ cũ: ${payload.previousStart.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`]
        : []),
      payload.location,
      `Ghế: ${payload.seatLabel}`,
      `Mã vé: ${payload.ticketCode}`,
    ];
    const attachments = payload.qrPayload
      ? [
          {
            filename: 'ma-qr-ve.png',
            content: await QRCode.toBuffer(payload.qrPayload, { width: 512, margin: 4 }),
            contentType: 'image/png' as const,
          },
        ]
      : [];
    await this.transport.send({
      to: payload.toEmail,
      subject: `${title} — ${payload.eventName}`,
      messageId: `<${id}@codegym.local>`,
      text: lines.join('\n'),
      html: lines.map((line) => `<p>${escape(line)}</p>`).join(''),
      attachments,
    });
    this.logger.log(`Accepted ${payload.type} message by configured transport.`);
  }
}
