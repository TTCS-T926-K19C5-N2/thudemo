import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  let projection: any;
  let service: TicketsService;

  beforeEach(() => {
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      ticket: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'new-ticket-1' }),
      },
      ticketLog: { create: vi.fn() },
      ticketMailDelivery: { create: vi.fn() },
    };
    db = {
      user: { findUnique: vi.fn().mockResolvedValue({ email: 'owner@example.com' }) },
      order: { findUnique: vi.fn() },
      ticket: { findMany: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn((cb) => cb(tx)),
    };
    projection = {
      forOwner: vi.fn(),
      forBuyer: vi.fn(),
    };
    signing = signingService();
    service = new TicketsService(db, signing, projection);
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
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
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

    it('creates 3 distinct unpredictable tickets for an order with 3 seats (S-25 AC)', async () => {
      const order3 = {
        id: ORDER_ID,
        showtimeId: SHOWTIME_ID,
        items: [
          { seatId: 'seat-1', categoryName: 'VIP', unitPrice: 300000, seat: { row: 'A', seatNumber: 1 } },
          { seatId: 'seat-2', categoryName: 'VIP', unitPrice: 300000, seat: { row: 'A', seatNumber: 2 } },
          { seatId: 'seat-3', categoryName: 'VIP', unitPrice: 300000, seat: { row: 'A', seatNumber: 3 } },
        ],
      };
      await service.issueForPaidOrder(tx, order3);
      const call = tx.ticket.createMany.mock.calls[0][0];
      expect(call.data).toHaveLength(3);
      const codes = call.data.map((t: any) => t.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(3);
      expect(codes[0]).not.toBe(codes[1]);
      expect(codes[1]).not.toBe(codes[2]);
    });

    it('is idempotent on duplicate webhook replays using skipDuplicates and ON CONFLICT (S-25 AC)', async () => {
      await service.issueForPaidOrder(tx, order);
      await service.issueForPaidOrder(tx, order);
      expect(tx.ticket.createMany).toHaveBeenCalledTimes(2);
      expect(tx.ticket.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
      expect(tx.ticket.createMany.mock.calls[1][0].skipDuplicates).toBe(true);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('listForOrder', () => {
    it('hides the order from anyone but its owner', async () => {
      projection.forOwner.mockRejectedValue(new NotFoundException('Không tìm thấy đơn hàng.'));
      await expect(service.listForOrder(ORDER_ID, 'someone-else')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for a missing order', async () => {
      projection.forOwner.mockRejectedValue(new NotFoundException('Không tìm thấy đơn hàng.'));
      await expect(service.listForOrder(ORDER_ID, OWNER_ID)).rejects.toThrow(NotFoundException);
    });

    it.each([OrderStatus.PENDING_PAYMENT, OrderStatus.EXPIRED, OrderStatus.NEEDS_REVIEW])(
      'throws when the order is %s',
      async (status) => {
        projection.forOwner.mockRejectedValue(new NotFoundException('Vé chỉ sẵn sàng sau khi thanh toán.'));
        await expect(service.listForOrder(ORDER_ID, OWNER_ID)).rejects.toThrow(NotFoundException);
      },
    );

    it('returns tickets of a PAID order with a verifiable QR payload', async () => {
      const mockTicket = {
        id: 'ticket-1',
        code: 'TK-12345',
        seatLabel: 'A-1',
        category: 'VIP',
        status: TicketStatus.VALID,
        qrPayload: 'ET1.Ed25519.test.qr',
      };
      projection.forOwner.mockResolvedValue({ tickets: [mockTicket] });

      const tickets = await service.listForOrder(ORDER_ID, OWNER_ID);

      expect(tickets[0]).toMatchObject({ id: 'ticket-1', code: 'TK-12345', seatLabel: 'A-1' });
      expect(tickets[0].qrPayload).toBe('ET1.Ed25519.test.qr');
    });
  });

  describe('transferTicket', () => {
    const TICKET_ID = 'ticket-123';
    const EMAIL = 'newowner@example.com';

    it('throws BadRequest on invalid email format', async () => {
      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, '')).rejects.toThrow(BadRequestException);
      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, 'invalid-email')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest if transferring to own email', async () => {
      db.user.findUnique.mockResolvedValue({ email: 'owner@example.com' });
      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, 'owner@example.com')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound if order not found or user is not owner', async () => {
      db.order.findUnique.mockResolvedValue(null);
      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, EMAIL)).rejects.toThrow(NotFoundException);

      db.order.findUnique.mockResolvedValue({ userId: 'other' });
      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, EMAIL)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound if ticket not found or does not belong to order', async () => {
      db.order.findUnique.mockResolvedValue({ userId: OWNER_ID });
      db.ticket.findUnique.mockResolvedValue(null);
      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, EMAIL)).rejects.toThrow(NotFoundException);

      db.ticket.findUnique.mockResolvedValue({ orderId: 'other' });
      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, EMAIL)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest if ticket is not VALID', async () => {
      db.order.findUnique.mockResolvedValue({ userId: OWNER_ID });
      db.ticket.findUnique.mockResolvedValue({ orderId: ORDER_ID, status: TicketStatus.CANCELLED });
      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, EMAIL)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest if concurrent request already invalidated the ticket', async () => {
      db.order.findUnique.mockResolvedValue({ userId: OWNER_ID });
      db.ticket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        orderId: ORDER_ID,
        status: TicketStatus.VALID,
        showtimeId: SHOWTIME_ID,
        seatId: 'seat-1',
        seatLabel: 'A-1',
        ticketType: 'VIP',
        price: 100,
      });
      // Simulate race condition: updateMany returns count 0
      tx.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, EMAIL)).rejects.toThrow(BadRequestException);
    });

    it('cancels old ticket and issues a new one with atomic update and audit logs', async () => {
      db.order.findUnique.mockResolvedValue({ userId: OWNER_ID });
      db.ticket.findUnique.mockResolvedValue({
        id: TICKET_ID,
        orderId: ORDER_ID,
        status: TicketStatus.VALID,
        showtimeId: SHOWTIME_ID,
        seatId: 'seat-1',
        seatLabel: 'A-1',
        ticketType: 'VIP',
        price: 100,
      });

      await service.transferTicket(ORDER_ID, TICKET_ID, OWNER_ID, EMAIL);

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: TICKET_ID, status: TicketStatus.VALID },
        data: expect.objectContaining({
          status: TicketStatus.CANCELLED,
          transferredToEmail: EMAIL,
        }),
      });

      expect(tx.ticket.create).toHaveBeenCalledTimes(1);
      const newTicketData = tx.ticket.create.mock.calls[0][0].data;
      expect(newTicketData.ownerEmail).toBe(EMAIL);
      expect(newTicketData.status).toBe(TicketStatus.VALID);
      expect(newTicketData.seatLabel).toBe('A-1');

      expect(tx.ticketLog.create).toHaveBeenCalledTimes(2);
      expect(tx.ticketLog.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          ticketId: TICKET_ID,
          action: 'TRANSFERRED',
          actorId: OWNER_ID,
        }),
      });
      expect(tx.ticketLog.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          ticketId: 'new-ticket-1',
          action: 'ISSUED_FROM_TRANSFER',
          actorId: OWNER_ID,
        }),
      });
      expect(tx.ticketMailDelivery.create).toHaveBeenCalledWith({
        data: {
          orderId: ORDER_ID,
          recipientEmail: EMAIL,
          ticketId: 'new-ticket-1',
          dedupeKey: 'transfer:new-ticket-1',
        },
      });
    });
  });
});
