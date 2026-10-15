import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter, type SendMailOptions } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service.js';

export const MAIL_MAX_ATTEMPTS = 3;
// Delay after failed attempt n (1-based) is n * MAIL_BACKOFF_STEP_MS: 1s, 2s.
export const MAIL_BACKOFF_STEP_MS = 1000;

export interface MailAttachment {
  filename: string;
  content: Buffer;
  cid: string;
}

export interface MailMessage {
  orderId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
}

export type MailSendResult =
  | { success: true; attempts: number }
  | { success: false; attempts: number; error: string };

export type MailSleep = (ms: number) => Promise<void>;

const defaultSleep: MailSleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Sends a mail with up to MAIL_MAX_ATTEMPTS tries and records the outcome in
// email_logs. Without SMTP_HOST the message goes to nodemailer's jsonTransport
// (nothing leaves the process), so local development never sends real mail.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private sleep: MailSleep = defaultSleep;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const smtpHost = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('SMTP_FROM') || 'noreply@event-ticketing.local';
    if (smtpHost) {
      const user = config.get<string>('SMTP_USER');
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(config.get<string>('SMTP_PORT')) || 587,
        secure: config.get<string>('SMTP_SECURE') === 'true',
        auth: user
          ? { user, pass: config.get<string>('SMTP_PASS') ?? '' }
          : undefined,
      });
      this.logger.log('Mail transport: SMTP host configured');
    } else {
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.logger.log('Mail transport: jsonTransport (SMTP_HOST not set)');
    }
  }

  // Test seam: replace the wait between attempts so tests run instantly.
  setSleepForTests(sleep: MailSleep): void {
    this.sleep = sleep;
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    const options: SendMailOptions = {
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        cid: a.cid,
      })),
    };

    let lastError = 'Unknown error';
    for (let attempt = 1; attempt <= MAIL_MAX_ATTEMPTS; attempt++) {
      try {
        await this.transporter.sendMail(options);
        await this.prisma.emailLog.create({
          data: {
            orderId: message.orderId,
            recipient: message.to,
            subject: message.subject,
            attempts: attempt,
            status: 'SENT',
            sentAt: new Date(),
          },
        });
        return { success: true, attempts: attempt };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        // Log the failure without the recipient address or raw provider text.
        this.logger.warn(
          JSON.stringify({
            event: 'ticket_email_attempt_failed',
            orderId: message.orderId,
            attempt,
            maxAttempts: MAIL_MAX_ATTEMPTS,
          }),
        );
        if (attempt < MAIL_MAX_ATTEMPTS) {
          await this.sleep(attempt * MAIL_BACKOFF_STEP_MS);
        }
      }
    }

    await this.prisma.emailLog.create({
      data: {
        orderId: message.orderId,
        recipient: message.to,
        subject: message.subject,
        attempts: MAIL_MAX_ATTEMPTS,
        status: 'FAILED',
        lastError: lastError.slice(0, 500),
      },
    });
    this.logger.error(
      JSON.stringify({
        event: 'ticket_email_failed',
        orderId: message.orderId,
        attempts: MAIL_MAX_ATTEMPTS,
        retryOnNextRequest: true,
      }),
    );
    return {
      success: false,
      attempts: MAIL_MAX_ATTEMPTS,
      error: `Gửi email thất bại sau ${MAIL_MAX_ATTEMPTS} lần thử.`,
    };
  }
}
