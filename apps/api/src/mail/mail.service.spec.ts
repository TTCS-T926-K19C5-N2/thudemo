import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MailService, MAIL_MAX_ATTEMPTS, type MailMessage } from './mail.service.js';

const ORDER_ID = '22222222-2222-4222-8222-222222222222';

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    orderId: ORDER_ID,
    to: 'buyer@example.com',
    subject: 'Vé',
    text: 'text',
    html: '<p>html</p>',
    attachments: [],
    ...overrides,
  };
}

describe('MailService (S-27 retry and logging)', () => {
  let db: any;
  let service: MailService;
  let sendMail: ReturnType<typeof vi.fn>;
  let sleeps: number[];

  beforeEach(() => {
    db = { emailLog: { create: vi.fn().mockResolvedValue({}) } };
    // No SMTP_HOST: the constructor uses jsonTransport, which never hits the network.
    service = new MailService(db, new ConfigService({}));
    sendMail = vi.fn();
    (service as any).transporter = { sendMail };
    sleeps = [];
    service.setSleepForTests(async (ms) => {
      sleeps.push(ms);
    });
  });

  it('sends once and logs SENT when the first attempt succeeds', async () => {
    sendMail.mockResolvedValueOnce({ messageId: 'm1' });

    const result = await service.send(message());

    expect(result).toEqual({ success: true, attempts: 1 });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(db.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: ORDER_ID,
        recipient: 'buyer@example.com',
        attempts: 1,
        status: 'SENT',
      }),
    });
  });

  it('retries with growing delay and succeeds on the third attempt', async () => {
    sendMail
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ messageId: 'm3' });

    const result = await service.send(message());

    expect(result).toEqual({ success: true, attempts: 3 });
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 2000]);
    expect(db.emailLog.create).toHaveBeenCalledTimes(1);
    expect(db.emailLog.create.mock.calls[0][0].data.status).toBe('SENT');
  });

  it('stops after 3 failed attempts and records FAILED for manual follow-up', async () => {
    sendMail.mockRejectedValue(new Error('SMTP down'));

    const result = await service.send(message());

    expect(MAIL_MAX_ATTEMPTS).toBe(3);
    expect(result.success).toBe(false);
    expect(sendMail).toHaveBeenCalledTimes(3);
    // No wait after the final failure.
    expect(sleeps).toEqual([1000, 2000]);
    expect(db.emailLog.create).toHaveBeenCalledTimes(1);
    expect(db.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        attempts: 3,
        lastError: 'SMTP down',
      }),
    });
  });

  it('truncates very long provider errors before storing them', async () => {
    sendMail.mockRejectedValue(new Error('x'.repeat(2000)));

    await service.send(message());

    const stored = db.emailLog.create.mock.calls[0][0].data.lastError as string;
    expect(stored.length).toBe(500);
  });

  it('never logs the recipient address on attempt failure', async () => {
    const warn = vi.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    sendMail.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({});

    await service.send(message({ to: 'secret-person@example.com' }));

    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('secret-person@example.com');
  });
});
