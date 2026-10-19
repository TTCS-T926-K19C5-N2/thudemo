import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service.js';

export const TICKET_MAIL_TRANSPORT = 'TICKET_MAIL_TRANSPORT';
// Reuse T-08's TLS/allowlist/attachment boundary. A dedicated synthetic-ticket
// catcher must not silently replace the existing registration SMTP provider.
export function ticketMailTransport(
  config: ConfigService,
  existing: MailService,
): MailService {
  const mode = config.get<string>('TICKET_MAIL_MODE');
  if (!mode || mode === 'smtp') return existing;
  if (mode !== 'catcher') throw new Error('Invalid ticket mail transport mode');
  const transport = new MailService(
    new ConfigService({
      REGISTRATION_MAIL_MODE: 'catcher',
      SMTP_HOST: config.get<string>('TICKET_SMTP_HOST'),
      SMTP_PORT: config.get<string>('TICKET_SMTP_PORT'),
      SMTP_FROM: config.get<string>('TICKET_SMTP_FROM'),
      REGISTRATION_ALLOWED_EMAILS:
        config.get<string>('TICKET_MAIL_ALLOWED_EMAILS') ?? '',
      APP_ENV: config.get<string>('APP_ENV'),
    }),
  );
  if (!transport.ready)
    throw new Error('Invalid isolated ticket catcher configuration');
  return transport;
}
