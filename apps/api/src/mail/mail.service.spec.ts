import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';

const { sendMail, createTransport } = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock('nodemailer', () => ({ default: { createTransport } }));
const config = (change: Record<string, string> = {}) =>
  new ConfigService({
    REGISTRATION_MAIL_MODE: 'smtp',
    SMTP_HOST: 'smtp.demo.invalid',
    SMTP_PORT: '587',
    SMTP_USER: 'fixture-user',
    SMTP_PASSWORD: 'fixture-only',
    SMTP_FROM: 'sender@demo.invalid',
    REGISTRATION_ALLOWED_EMAILS: 'allowed@demo.invalid',
    ...change,
  });
const message = {
  to: 'allowed@demo.invalid',
  subject: 'Activation fixture',
  text: 'Fixture',
  messageId: '<fixture@demo.invalid>',
};

describe('Registration SMTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTransport.mockReturnValue({ sendMail });
    sendMail.mockResolvedValue({ accepted: [message.to], rejected: [] });
  });

  it('requires TLS and disables logging and file/URL access for external SMTP', async () => {
    const mail = new MailService(config());
    expect(mail.ready).toBe(true);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: false,
        requireTLS: true,
        ignoreTLS: false,
        tls: { rejectUnauthorized: true },
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    await mail.send(message);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'sender@demo.invalid',
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
  });

  it('allows any valid registration recipient when the optional allowlist is empty', async () => {
    const mail = new MailService(config({ REGISTRATION_ALLOWED_EMAILS: '' }));
    expect(mail.ready).toBe(true);
    await mail.send({ ...message, to: 'other-fixture@demo.invalid' });
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it('refuses a recipient outside the configured allowlist before sendMail', async () => {
    const mail = new MailService(config());
    await expect(
      mail.send({ ...message, to: 'not-authorized@demo.invalid' }),
    ).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('permits a local catcher only outside production and refuses remote plaintext catchers', () => {
    expect(
      new MailService(
        config({
          REGISTRATION_MAIL_MODE: 'catcher',
          SMTP_HOST: '127.0.0.1',
          APP_ENV: 'development',
        }),
      ).ready,
    ).toBe(true);
    expect(
      new MailService(
        config({
          REGISTRATION_MAIL_MODE: 'catcher',
          SMTP_HOST: '127.0.0.1',
          APP_ENV: 'production',
        }),
      ).ready,
    ).toBe(false);
    expect(
      new MailService(
        config({
          REGISTRATION_MAIL_MODE: 'catcher',
          SMTP_HOST: 'remote.demo.invalid',
        }),
      ).ready,
    ).toBe(false);
  });

  it('does not mark provider rejection as delivered', async () => {
    sendMail.mockResolvedValue({ accepted: [], rejected: [message.to] });
    await expect(new MailService(config()).send(message)).rejects.toThrow();
  });
});
