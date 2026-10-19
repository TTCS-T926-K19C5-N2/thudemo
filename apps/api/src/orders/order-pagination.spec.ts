import { orderPagination } from './order-pagination.js';
import { effectiveOrderStatus } from './order-history.service.js';

describe('Order read boundaries', () => {
  it('defaults to a bounded page and never overflows the database offset', () => {
    expect(orderPagination({})).toEqual({ page: 1, pageSize: 10, skip: 0 });
    expect(() =>
      orderPagination({ page: '2147483647', pageSize: '50' }),
    ).toThrow();
    expect(() => orderPagination({ page: ['1', '2'] })).toThrow();
  });
  it('derives only pending expiry, retaining terminal statuses at the exact deadline', () => {
    const now = new Date('2026-10-07T00:00:00Z');
    expect(effectiveOrderStatus('PENDING_PAYMENT', now, now)).toBe('EXPIRED');
    for (const status of ['PAID', 'CANCELLED', 'EXPIRED'] as const)
      expect(effectiveOrderStatus(status, now, now)).toBe(status);
    expect(
      effectiveOrderStatus('PENDING_PAYMENT', new Date(now.getTime() + 1), now),
    ).toBe('PENDING_PAYMENT');
  });
});
