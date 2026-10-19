import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  messageId: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: 'image/png';
    cid?: string;
  }>;
}

@Injectable()
export class MailService {
  private readonly transport?: Transporter;
  private readonly from: string;
  private readonly allowed: Set<string>;
  readonly ready: boolean;

  constructor(config: ConfigService) {
    const mode = config.get<string>('REGISTRATION_MAIL_MODE') ?? 'off';
    const host = config.get<string>('SMTP_HOST') ?? '';
    const port = Number(config.get<string>('SMTP_PORT') ?? '587');
    const user = config.get<string>('SMTP_USER');
    const password = config.get<string>('SMTP_PASSWORD');
    this.from = config.get<string>('SMTP_FROM') ?? '';
    this.allowed = new Set(
      (config.get<string>('REGISTRATION_ALLOWED_EMAILS') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    const catcher = mode === 'catcher';
    const localCatcher =
      catcher &&
      ['localhost', '127.0.0.1', 'mailpit'].includes(host) &&
      config.get<string>('APP_ENV') !== 'production';
    this.ready =
      (localCatcher || (mode === 'smtp' && !!user && !!password)) &&
      !!host &&
      Number.isInteger(port) &&
      port > 0 &&
      port <= 65535 &&
      /^[^\s<>@]+@[^\s<>@]+$/.test(this.from);
    if (this.ready) {
      const secure = config.get<string>('SMTP_SECURE') === 'true';
      this.transport = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: !catcher && !secure,
        ignoreTLS: catcher,
        auth: catcher ? undefined : { user: user!, pass: password! },
        tls: { rejectUnauthorized: true },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
      });
    }
  }

  async send(message: OutgoingMail): Promise<void> {
    if (!this.ready || !this.transport)
      throw new ServiceUnavailableException('Dịch vụ email chưa sẵn sàng.');
    if (this.allowed.size && !this.allowed.has(message.to.toLowerCase()))
      throw new ServiceUnavailableException(
        'Địa chỉ thử nghiệm chưa được phép.',
      );
    const result = await this.transport.sendMail({
      ...message,
      from: this.from,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new ServiceUnavailableException('Chưa thể chuyển email.');
  }
}
