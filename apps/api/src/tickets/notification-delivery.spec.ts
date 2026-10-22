import { ConfigService } from '@nestjs/config';
import { TicketDeliveryService } from './ticket-delivery.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { TicketQrService } from '../orders/ticket-qr.service.js';
import { TicketEmailService } from './ticket-email.service.js';

it('delivers a queued accounting alert for an unpaid review order without granting a ticket', async () => {
  const db = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValueOnce([{
      id: 'alert-job', orderId: 'order', attempts: 1, leaseToken: 'lease',
      notification: { kind: 'ACCOUNTANT', subject: 'Sai số tiền', text: 'Cần đối soát đơn thử.' },
    }]).mockResolvedValue([]),
    ticketMailDelivery: { updateMany: vi.fn() },
    order: { findUnique: vi.fn().mockResolvedValue({ status: 'NEEDS_REVIEW' }) },
  };
  const mail = { ready: true, send: vi.fn().mockResolvedValue(undefined) };
  const projection = { forOwner: vi.fn() };
  const service = new TicketDeliveryService(db as unknown as PrismaService,
    projection as unknown as TicketQrService, mail as unknown as MailService,
    new ConfigService({ ACCOUNTANT_EMAIL: 'accountant@demo.invalid' }));
  await service.drain();
  expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({
    to: 'accountant@demo.invalid', subject: 'Sai số tiền', text: 'Cần đối soát đơn thử.',
  }));
  expect(projection.forOwner).not.toHaveBeenCalled();
  expect(db.ticketMailDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'SENT' }),
  }));
});

it('queues reminders durably with one key per ticket and schedule revision rather than reporting a log as sent', async () => {
  const queue = { enqueueNotification: vi.fn().mockResolvedValue(undefined) };
  const email = new TicketEmailService(queue as unknown as TicketDeliveryService);
  await email.sendReminder({
    orderId: 'order', ticketId: 'ticket',
    showtimeStart: new Date('2026-11-01T12:00:00Z'),
    scheduleVersion: new Date('2026-10-22T03:00:00Z'),
    location: 'Room A', type: 'REMINDER',
  });
  expect(queue.enqueueNotification).toHaveBeenCalledWith('order',
    'reminder:ticket:REMINDER:2026-11-01T12:00:00.000Z:2026-10-22T03:00:00.000Z', expect.objectContaining({ kind: 'REMINDER', ticketId: 'ticket' }));
});
