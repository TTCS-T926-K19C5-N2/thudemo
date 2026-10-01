import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentsController } from './payments.controller.js';
import { OrdersController } from './orders.controller.js';
import { PaymentsService } from './payments.service.js';

describe('PaymentsController & OrdersController', () => {
  let paymentsController: PaymentsController;
  let ordersController: OrdersController;
  let paymentsServiceMock: {
    handleWebhook: ReturnType<typeof vi.fn>;
    getOrderStatus: ReturnType<typeof vi.fn>;
    createOrder: ReturnType<typeof vi.fn>;
    computeSignature: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    paymentsServiceMock = {
      handleWebhook: vi.fn(),
      getOrderStatus: vi.fn(),
      createOrder: vi.fn(),
      computeSignature: vi.fn(),
    };
    paymentsController = new PaymentsController(
      paymentsServiceMock as unknown as PaymentsService,
    );
    ordersController = new OrdersController(
      paymentsServiceMock as unknown as PaymentsService,
    );
  });

  it('handleWebhook passes raw body, signature header, and client IP', async () => {
    const rawBodyBuffer = Buffer.from('{"orderCode":"ORD-1"}');
    const mockReq = {
      rawBody: rawBodyBuffer,
      ip: '127.0.0.1',
      headers: {
        'x-signature': 'sig123',
        'x-forwarded-for': '203.0.113.195',
      },
    } as any;

    paymentsServiceMock.handleWebhook.mockResolvedValue({ success: true });

    const result = await paymentsController.handleWebhook(mockReq, 'sig123');

    expect(paymentsServiceMock.handleWebhook).toHaveBeenCalledWith(
      rawBodyBuffer,
      'sig123',
      '203.0.113.195',
    );
    expect(result).toEqual({ success: true });
  });

  it('OrdersController.getStatus calls getOrderStatus', async () => {
    paymentsServiceMock.getOrderStatus.mockResolvedValue({
      id: 'order-1',
      status: 'PAID',
    });

    const result = await ordersController.getStatus('order-1');
    expect(paymentsServiceMock.getOrderStatus).toHaveBeenCalledWith('order-1');
    expect(result).toEqual({ id: 'order-1', status: 'PAID' });
  });
});
