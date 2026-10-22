import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TicketDeliveryService } from './ticket-delivery.service.js';
import { ticketMailTransport } from './ticket-mail-transport.js';
import { MailService } from '../mail/mail.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TicketQrService } from '../orders/ticket-qr.service.js';

describe('Ticket delivery contract (unit; SMTP receipt is tested separately)', () => {
  let db: any, projection: any, mail: any, service: TicketDeliveryService;
  const orderId = randomUUID(), userId = randomUUID();
  const ticket = { ticketId: randomUUID(), status: 'VALID', qrPayload: 'ET1.unit-render-only', eventName: '<script>event</script>', showtimeStart: '2026-10-19T12:00:00Z', category: 'VIP', seatLabel: 'A-1' };
  beforeEach(() => {
    db = { $executeRaw: vi.fn().mockResolvedValue(1), $queryRaw: vi.fn().mockResolvedValue([]), ticketMailDelivery: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(({ data }) => ({ id: randomUUID(), status: 'QUEUED', ...data })) }, order: { findUnique: vi.fn().mockResolvedValue({ userId, status: 'PAID', user: { email: 'buyer@demo.invalid' } }) } };
    db.$transaction = vi.fn((fn) => fn(db));
    projection = { forOwner: vi.fn().mockResolvedValue({ tickets: [ticket, { ...ticket, ticketId: randomUUID(), status: 'CANCELLED', qrPayload: null }] }) };
    mail = { ready: true, send: vi.fn().mockResolvedValue(undefined) };
    service = new TicketDeliveryService(db as PrismaService, projection as TicketQrService, mail as MailService, new ConfigService({ TICKET_MAIL_WORKER: 'true' }));
  });
  it('validates request ID before accessing an order and checks ownership before replay', async () => {
    await expect(service.resend(orderId, userId, { requestId: 'bad' })).rejects.toThrow(BadRequestException);
    expect(projection.forOwner).not.toHaveBeenCalled();
    projection.forOwner.mockRejectedValue(new NotFoundException());
    await expect(service.resend(orderId, userId, { requestId: randomUUID() })).rejects.toThrow(NotFoundException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('refuses an unavailable transport without minting or queuing another ticket', async () => {
    mail.ready = false;
    await expect(service.resend(orderId, userId, { requestId: randomUUID() })).rejects.toThrow(ServiceUnavailableException);
    expect(db.ticketMailDelivery.create).not.toHaveBeenCalled();
  });
  it('returns the same delivery for a replay but rejects reuse against another order', async () => {
    const id = randomUUID(); db.ticketMailDelivery.findUnique.mockResolvedValue({ id, orderId, status: 'SENT' });
    expect(await service.resend(orderId, userId, { requestId: randomUUID() })).toEqual({ deliveryId: id, status: 'SENT' });
    expect(db.ticketMailDelivery.create).not.toHaveBeenCalled();
    db.ticketMailDelivery.findUnique.mockResolvedValue({ id, orderId: randomUUID(), status: 'SENT' });
    await expect(service.resend(orderId, userId, { requestId: randomUUID() })).rejects.toThrow(BadRequestException);
  });
  it('renders actual PNG attachments from canonical payload only, escapes HTML and excludes cancelled tickets/payment data', async () => {
    const job = { id: randomUUID(), orderId, attempts: 1, leaseToken: randomUUID() };
    db.$queryRaw.mockResolvedValueOnce([job]).mockResolvedValueOnce([]);
    await service.drain();
    const message = mail.send.mock.calls[0][0];
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].content.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    expect(message.html).toContain('&lt;script&gt;event&lt;/script&gt;');
    expect(message.html).not.toContain('<script>');
    expect(Object.keys(message).sort()).toEqual(['attachments','html','messageId','subject','text','to']);
    expect(message).not.toHaveProperty('amount'); expect(message).not.toHaveProperty('transactionId');
    expect(db.ticketMailDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: job.id, leaseToken: job.leaseToken, status: 'SENDING' }, data: expect.objectContaining({ status: 'SENT' }) }));
  });
  it.each([1,2,3])('retries with increasing delay and caps attempts at3 (attempt%d)', async (attempts) => {
    const job = { id: randomUUID(), orderId, attempts, leaseToken: randomUUID() };
    db.$queryRaw.mockResolvedValueOnce([job]).mockResolvedValueOnce([]); mail.send.mockRejectedValue(new Error('provider secret that must not be persisted'));
    const start = Date.now(); await service.drain(); const finish = Date.now();
    const { where, data } = db.ticketMailDelivery.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ id: job.id, leaseToken: job.leaseToken });
    expect(data.status).toBe(attempts === 3 ? 'FAILED' : 'QUEUED');
    expect(data.failureCode).toBe(attempts === 3 ? 'RETRY_EXHAUSTED' : 'DELIVERY_RETRY');
    const delay = attempts === 1 ? 5000 : 15000;
    expect(data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(start + delay);
    expect(data.nextAttemptAt.getTime()).toBeLessThanOrEqual(finish + delay);
    expect(JSON.stringify(data)).not.toContain('provider secret');
  });
  it('uses a dedicated synthetic catcher without replacing registration SMTP; refuses production catcher', () => {
    const existing = {} as MailService;
    expect(ticketMailTransport(new ConfigService({}), existing)).toBe(existing);
    const settings = { TICKET_MAIL_MODE: 'catcher', TICKET_SMTP_HOST: '127.0.0.1', TICKET_SMTP_PORT: '1127', TICKET_SMTP_FROM: 'tickets@demo.invalid', APP_ENV: 'test' };
    const catcher = ticketMailTransport(new ConfigService(settings), existing);
    expect(catcher.ready).toBe(true); expect(catcher).not.toBe(existing);
    expect(() => ticketMailTransport(new ConfigService({ ...settings, APP_ENV: 'production' }), existing)).toThrow();
  });
});
