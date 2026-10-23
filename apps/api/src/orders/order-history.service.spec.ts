import { describe, expect, it, vi } from 'vitest';
import { OrderHistoryService } from './order-history.service.js';

describe('OrderHistoryService.current coupon snapshot', () => {
  it('returns the persisted subtotal, discount, and coupon code after apply', async () => {
    const now = new Date('2026-10-23T00:00:00.000Z');
    const order = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      createdAt: now,
      status: 'PENDING_PAYMENT',
      paymentExpiresAt: new Date(now.getTime() + 600_000),
      totalAmount: 91,
      subtotalAmount: 101,
      discountAmount: 10,
      couponCodeSnapshot: 'S56FLOOR10',
      showtime: {
        id: '33333333-3333-4333-8333-333333333333',
        startTime: new Date(now.getTime() + 86_400_000),
        event: { id: '44444444-4444-4444-8444-444444444444', name: 'Fixture', location: 'Local' },
      },
      event: { id: '44444444-4444-4444-8444-444444444444', name: 'Fixture', description: '', location: 'Local', posterPath: null, bannerPath: null },
      items: [{ id: '55555555-5555-4555-8555-555555555555', seatId: '66666666-6666-4666-8666-666666666666', categoryName: 'QA', tierName: null, unitPrice: 101, seat: { row: 'QA', seatNumber: 1 } }],
      payments: [],
      _count: { items: 1, payments: 0, logs: 0 },
    };
    const tx = {
      order: {
        findUnique: vi.fn().mockResolvedValue({ userId: order.userId }),
        findFirst: vi.fn().mockResolvedValue(order),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ serverTime: now }]),
    };
    const db = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new OrderHistoryService(db as never);

    const actual = await service.current(order.id, order.userId);

    expect(actual).toMatchObject({
      totalAmount: 91,
      subtotalAmount: 101,
      discountAmount: 10,
      couponCode: 'S56FLOOR10',
    });
    expect(tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ subtotalAmount: true, discountAmount: true, couponCodeSnapshot: true }),
    }));
  });
});
