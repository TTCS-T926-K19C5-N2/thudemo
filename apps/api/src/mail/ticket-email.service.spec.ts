import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { TicketEmailService } from './ticket-email.service.js';

const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

const QR_A = 'v1.k1.codeAAAAAAAA.44444444-4444-4444-8444-444444444444.' + 'a'.repeat(86);

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    userId: OWNER_ID,
    status: 'PAID',
    totalAmount: 600000,
    showtime: {
      startTime: new Date('2026-11-01T12:00:00Z'),
      event: { name: 'Concert', location: 'Hà Nội' },
    },
    user: { email: 'buyer@example.com' },
    ...overrides,
  };
}

describe('TicketEmailService (S-27)', () => {
  let prisma: any;
  let tickets: any;
  let mail: any;
  let service: TicketEmailService;

  beforeEach(() => {
    prisma = {
      order: { findUnique: vi.fn().mockResolvedValue(orderRow()) },
      // Tickets are only read by this service; it never creates or updates one.
      ticket: { create: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    };
    tickets = {
      listForOrder: vi.fn().mockResolvedValue([
        { id: 't1', code: 'codeAAAAAAAA', seatLabel: 'A-1', ticketType: 'VIP', status: 'VALID', qrPayload: QR_A, seatId: 's1' },
      ]),
    };
    mail = {
      send: vi.fn().mockResolvedValue({ success: true, attempts: 1 }),
    };
    service = new TicketEmailService(prisma, tickets, mail);
  });

  it('sends the already-issued tickets with their stored QR payload', async () => {
    const result = await service.sendTicketsForOrder(ORDER_ID, OWNER_ID);

    expect(result).toEqual({ sent: true, attempts: 1 });
    expect(mail.send).toHaveBeenCalledTimes(1);
    const sent = mail.send.mock.calls[0][0];
    expect(sent.to).toBe('buyer@example.com');
    expect(sent.orderId).toBe(ORDER_ID);
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0].cid).toBe('qr-t1');
    expect(sent.html).toContain('cid:qr-t1');
  });

  it('automatic delivery sends to the owner account without a request user', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({ userId: OWNER_ID })
      .mockResolvedValueOnce(orderRow());

    const result = await service.sendTicketsForPaidOrderSystem(ORDER_ID);

    expect(result).toEqual({ sent: true, attempts: 1 });
    expect(mail.send.mock.calls[0][0].to).toBe('buyer@example.com');
  });

  it('automatic delivery returns not-found for a missing order', async () => {
    prisma.order.findUnique.mockResolvedValueOnce(null);

    const result = await service.sendTicketsForPaidOrderSystem('missing');

    expect(result.sent).toBe(false);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('never creates tickets when resending (no new ticket rows)', async () => {
    await service.sendTicketsForOrder(ORDER_ID, OWNER_ID);
    await service.sendTicketsForOrder(ORDER_ID, OWNER_ID);

    expect(prisma.ticket.create).not.toHaveBeenCalled();
    expect(prisma.ticket.createMany).not.toHaveBeenCalled();
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('rejects orders that are not PAID, without sending mail', async () => {
    prisma.order.findUnique.mockResolvedValueOnce(orderRow({ status: 'PENDING_PAYMENT' }));

    await expect(service.sendTicketsForOrder(ORDER_ID, OWNER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('returns not-found for another user\'s order without revealing it', async () => {
    const result = await service.sendTicketsForOrder(ORDER_ID, OTHER_ID);

    expect(result.sent).toBe(false);
    expect(mail.send).not.toHaveBeenCalled();
    expect(tickets.listForOrder).not.toHaveBeenCalled();
  });

  it('skips cancelled (transferred-away) tickets', async () => {
    tickets.listForOrder.mockResolvedValueOnce([
      { id: 't0', code: 'oldAAAAAAAA', seatLabel: 'A-1', ticketType: 'VIP', status: 'CANCELLED', qrPayload: null, seatId: 's1' },
      { id: 't1', code: 'codeAAAAAAAA', seatLabel: 'A-2', ticketType: 'VIP', status: 'VALID', qrPayload: QR_A, seatId: 's2' },
    ]);

    await service.sendTicketsForOrder(ORDER_ID, OWNER_ID);

    const sent = mail.send.mock.calls[0][0];
    expect(sent.attachments.map((a: any) => a.cid)).toEqual(['qr-t1']);
  });

  it('reports failure when all send attempts fail', async () => {
    mail.send.mockResolvedValueOnce({ success: false, attempts: 3, error: 'Gửi email thất bại sau 3 lần thử.' });

    const result = await service.sendTicketsForOrder(ORDER_ID, OWNER_ID);

    expect(result).toEqual({ sent: false, attempts: 3, error: 'Gửi email thất bại sau 3 lần thử.' });
  });

  it('escapes ticket values inside the HTML body', async () => {
    tickets.listForOrder.mockResolvedValueOnce([
      { id: 't1', code: '<script>x</script>', seatLabel: 'A-1', ticketType: 'VIP', status: 'VALID', qrPayload: QR_A, seatId: 's1' },
    ]);

    await service.sendTicketsForOrder(ORDER_ID, OWNER_ID);

    const html: string = mail.send.mock.calls[0][0].html;
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
