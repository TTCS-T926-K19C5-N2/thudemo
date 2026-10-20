import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { OrderHistoryService } from './order-history.service.js';
import { ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import { OrdersController } from './orders.controller.js';
import { TicketsService } from '../tickets/tickets.service.js';

describe('Order audit history', () => {
  it('returns a merged chronological timeline and removes sensitive fields', async () => {
    const at = new Date('2026-10-20T10:00:00.000Z');
    const db = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'order-1',
          holdSessionId: 'hold-session-1',
          holdToken: 'hold-token-1',
          showtimeId: 'show-1',
          logs: [
            {
              id: 'order-event',
              type: 'ORDER_STATUS_CHANGED',
              attemptNo: null,
              detail: {
                actorType: 'SYSTEM',
                fromStatus: 'PENDING',
                toStatus: 'PAID',
                accessToken: 'must-not-leak',
              },
              createdAt: at,
            },
          ],
          tickets: [
            {
              seatLabel: 'A-1',
              logs: [
                {
                  id: 'ticket-event',
                  action: 'TRANSFERRED',
                  actorId: 'buyer-1',
                  detail: { toEmail: 'private@example.invalid' },
                  createdAt: new Date(at.getTime() + 1),
                },
              ],
            },
          ],
          items: [
            {
              id: 'item-1',
              seatId: 'seat-1',
              seat: { row: 'A', seatNumber: 1 },
            },
          ],
        }),
      },
      holdLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'hold-event',
            action: 'CLAIMED',
            actorId: 'buyer-1',
            actorType: 'USER',
            seatIds: ['seat-1'],
            fromExpiresAt: null,
            toExpiresAt: at,
            createdAt: new Date(at.getTime() - 1),
          },
        ]),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'admission-event',
          ticketId: 'item-1',
          staffId: 'staff-1',
          kind: 'NORMAL',
          reason: null,
          enteredAt: new Date(at.getTime() + 2),
          gateName: 'Gate A',
        },
      ]),
    };
    const service = new OrderHistoryService(db as never);

    const result = await service.audit('order-1');

    expect(result.events.map((event) => event.source)).toEqual([
      'HOLD',
      'ORDER',
      'TICKET',
      'ADMISSION',
    ]);
    expect(result.events[1]).toMatchObject({
      actorType: 'SYSTEM',
      fromStatus: 'PENDING',
      toStatus: 'PAID',
    });
    expect(JSON.stringify(result)).not.toContain('private@example.invalid');
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.holdLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderId: 'order-1',
          showtimeId: 'show-1',
          holdSessionId: 'hold-session-1',
          token: 'hold-token-1',
        },
      }),
    );
  });

  it('returns not found for unknown orders', async () => {
    const service = new OrderHistoryService({
      order: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);

    await expect(service.audit('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('restricts the audit route to ADMIN role at the controller boundary', () => {
    const reflector = new Reflector();
    expect(
      reflector.get(ROLES_KEY, OrdersController.prototype.auditLog),
    ).toEqual(['ADMIN']);
  });

  it('writes an issuance audit only for tickets returned as newly inserted', async () => {
    const ticketLog = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const tickets = Object.create(TicketsService.prototype) as TicketsService;
    const signing = {
      sign: vi.fn(() => ({ keyId: 'key-1', signature: 'sig' })),
    };
    Object.assign(tickets, { signing });
    const tx = {
      ticket: {
        createManyAndReturn: vi.fn().mockResolvedValue([
          {
            id: 'ticket-1',
            orderId: 'order-1',
            status: 'VALID',
            seatId: 'seat-1',
          },
        ]),
      },
      ticketLog,
      $executeRaw: vi.fn(),
    };
    await tickets.issueForPaidOrder(tx as never, {
      id: 'order-1',
      showtimeId: 'show-1',
      items: [
        {
          seatId: 'seat-1',
          categoryName: 'VIP',
          unitPrice: 100,
          seat: { row: 'A', seatNumber: 1 },
        },
      ],
    });

    expect(ticketLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ ticketId: 'ticket-1', action: 'ISSUED' }),
      ],
    });
  });
});
