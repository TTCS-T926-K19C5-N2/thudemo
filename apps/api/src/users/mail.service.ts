import { Injectable, Logger } from '@nestjs/common';

export interface ActivationEmail {
  to: string;
  url: string;
  queuedAt: Date;
}

// Dev substitute for a real delivery flow (S-03 story note allows a fake
// mailer when no SMTP is available; T-07 owns the approved delivery flow).
// The outbox is intentionally in-memory and only readable through a dev-only
// endpoint. Tokens are never written to logs.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly outbox: ActivationEmail[] = [];

  activationUrl(token: string): string {
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
    return `${origin}/activate?token=${token}`;
  }

  async sendActivationEmail(email: string, token: string): Promise<void> {
    this.outbox.push({
      to: email,
      url: this.activationUrl(token),
      queuedAt: new Date(),
    });
    this.logger.log(
      `Activation email queued for ${email} (${this.outbox.length} in dev outbox)`,
    );
  }

  listActivationLinks(email: string): string[] {
    return this.outbox
      .filter((entry) => entry.to === email)
      .map((entry) => entry.url);
  }
}
