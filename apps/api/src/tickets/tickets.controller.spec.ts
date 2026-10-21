import { describe, it, expect, vi } from 'vitest';
import { OrderTicketsController } from './tickets.controller.js';
import type { TicketsService } from './tickets.service.js';
import type { TicketDeliveryService } from './ticket-delivery.service.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';

describe('OrderTicketsController', () => {
  const ORDER_ID = '22222222-2222-4222-8222-222222222222';
  const TICKET_ID = '33333333-3333-4333-8333-333333333333';
  const USER_ID = '11111111-1111-4111-8111-111111111111';

  it('delegates cancel to ticketsService.cancelTicket and returns success', async () => {
    const cancelSpy = vi.fn().mockResolvedValue(undefined);
    const ticketsService = {
      cancelTicket: cancelSpy,
      transferTicket: vi.fn(),
    } as unknown as TicketsService;

    const deliveryService = {} as TicketDeliveryService;

    const controller = new OrderTicketsController(ticketsService, deliveryService);
    const req = { user: { id: USER_ID } } as unknown as AuthenticatedRequest;

    const result = await controller.cancel(ORDER_ID, TICKET_ID, req);

    expect(cancelSpy).toHaveBeenCalledWith(ORDER_ID, TICKET_ID, USER_ID);
    expect(result).toEqual({ success: true });
  });
});
