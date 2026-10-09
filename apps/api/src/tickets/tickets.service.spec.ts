import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { OrderStatus, TicketStatus } from '@prisma/client';
import { TicketSigningService } from './ticket-signing.service.js';
import { TicketsService } from './tickets.service.js';

const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const SHOWTIME_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';

function signingService() {
  const config = { get: () => undefined } as any;
  return new TicketSigningService(config);
}

describe('TicketsService', () => {
  let db: any;
  let tx: any;
  let signing: TicketSigningService;
  let service: TicketsService;

  beforeEach(() => {
    tx = { ticket: { createMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    db = {
      order: { findUnique: vi.fn() },
      ticket: { findMany: vi.fn() },
    };
    signing = signingService();
    service = new TicketsService(db, signing);
  });

  describe('issueForPaidOrder', () => {
    const order = {
      id: ORDER_ID,
      showtimeId: SHOWTIME_ID,
      items: [
        { seatId: 'seat-a1', categoryName: 'VIP', unitPrice: 300000, seat: { row: 'A', seatNumber: 1 } },
        { seatId: 'seat-a2', categoryName: 'VIP', unitPrice: 300000, seat: { row: 'A', seatNumber: 2 } },
      ],
    };

    it('creates one signed ticket per seat, skipping duplicates on replay', async () => {
      await service.issueForPaidOrder(tx, order);

      expect(tx.ticket.createMany).toHaveBeenCalledTimes(1);
      const { data, skipDuplicates } = tx.ticket.createMany.mock.calls[0][0];
      expect(skipDuplicates).toBe(true);
      expect(data).toHaveLength(2);
      expect(data.map((t: any) => t.seatLabel)).toEqual(['A-1', 'A-2']);
      expect(data[0]).toMatchObject({
        orderId: ORDER_ID,
        showtimeId: SHOWTIME_ID,
        seatId: 'seat-a1',
        ticketType: 'VIP',
        status: TicketStatus.VALID,
        price: 300000,
      });
    });

    it('stores a signature that verifies against the stored code and showtime', async () => {
      await service.issueForPaidOrder(tx, order);
      const [first, second] = tx.ticket.createMany.mock.calls[0][0].data;

      expect(first.code).not.toBe(second.code);
      const qr = `v1.${first.keyId}.${first.code}.${SHOWTIME_ID}.${first.signature}`;
      expect(signing.verify(qr)).toMatchObject({ valid: true });
      // A signature cannot be moved onto another ticket's code.
      const moved = `v1.${first.keyId}.${second.code}.${SHOWTIME_ID}.${first.signature}`;
      expect(signing.verify(moved)).toMatchObject({ valid: false });
    });

    it('does nothing for an order without items', async () => {
      await service.issueForPaidOrder(tx, { ...order, items: [] });
      expect(tx.ticket.createMany).not.toHaveBeenCalled();
    });
  });

  describe('listForOrder', () => {
    it('hides the order from anyone but its owner', async () => {
      db.order.findUnique.mockResolvedValue({
        userId: 'someone-else',
        status: OrderStatus.PAID,
        showtimeId: SHOWTIME_ID,
      });
      await expect(service.listForOrder(ORDER_ID, OWNER_ID)).rejects.toThrow(NotFoundException);
      expect(db.ticket.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFound for a missing order', async () => {
      db.order.findUnique.mockResolvedValue(null);
      await expect(service.listForOrder(ORDER_ID, OWNER_ID)).rejects.toThrow(NotFoundException);
    });

    it.each([OrderStatus.PENDING_PAYMENT, OrderStatus.EXPIRED, OrderStatus.NEEDS_REVIEW])(
      'returns no tickets while the order is %s',
      async (status) => {
        db.order.findUnique.mockResolvedValue({ userId: OWNER_ID, status, showtimeId: SHOWTIME_ID });
        await expect(service.listForOrder(ORDER_ID, OWNER_ID)).resolves.toEqual([]);
        expect(db.ticket.findMany).not.toHaveBeenCalled();
      },
    );

    it('returns tickets of a PAID order with a verifiable QR payload', async () => {
      await service.issueForPaidOrder(tx, {
        id: ORDER_ID,
        showtimeId: SHOWTIME_ID,
        items: [{ seatId: 'seat-a1', categoryName: 'VIP', unitPrice: 1, seat: { row: 'A', seatNumber: 1 } }],
      });
      const stored = tx.ticket.createMany.mock.calls[0][0].data[0];
      db.order.findUnique.mockResolvedValue({ userId: OWNER_ID, status: OrderStatus.PAID, showtimeId: SHOWTIME_ID });
      db.ticket.findMany.mockResolvedValue([
        { ...stored, id: 'ticket-1' },
        { ...stored, id: 'legacy', code: 'TK-00001', keyId: null, signature: null },
      ]);

      const tickets = await service.listForOrder(ORDER_ID, OWNER_ID);

      expect(tickets[0]).toMatchObject({ id: 'ticket-1', code: stored.code, seatLabel: 'A-1' });
      expect(signing.verify(tickets[0].qrPayload!)).toMatchObject({ valid: true });
      expect(tickets[1].qrPayload).toBeNull();
    });
  });
});
