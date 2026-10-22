import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { BookingAccessGuard } from './booking-access.module.js';
import type { BookingAccessService } from './booking-access.service.js';
import { isPeerProtectedProxyPath, signLoginPeer } from 'shared/login-peer';

const id = '11111111-1111-4111-8111-111111111111';
function fixture(path: string, headers: Record<string, string> = {}) {
  const access = {
    limit: vi.fn().mockResolvedValue(0),
    admitted: vi.fn().mockResolvedValue(true),
  };
  const req = {
    method: 'POST',
    path,
    headers,
    user: { id: 'buyer' },
    socket: { remoteAddress: '::ffff:127.0.0.1' },
    body: { showtimeId: id },
  };
  const setHeader = vi.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return {
    access,
    context,
    setHeader,
    guard: new BookingAccessGuard(access as unknown as BookingAccessService),
  };
}
describe('Booking admission transport boundary', () => {
  const previous = process.env.AUTH_PROXY_SECRET;
  afterEach(() => {
    if (previous === undefined) delete process.env.AUTH_PROXY_SECRET;
    else process.env.AUTH_PROXY_SECRET = previous;
  });
  it.each([
    `/showtimes/${id}/holds`,
    `/SHOWTIMES/${id}/HOLDS/`,
    `/showtimes/${id}/%68olds/`,
    '/orders/',
  ])('protects equivalent path %s', async (path) => {
    const f = fixture(path);
    expect(await f.guard.canActivate(f.context)).toBe(true);
    expect(f.access.limit).toHaveBeenCalledWith(
      path.toLowerCase().includes('orders') ? 'order' : 'hold',
      'buyer',
      '127.0.0.1',
    );
    expect(f.access.admitted).toHaveBeenCalledWith(id, 'buyer');
    expect(isPeerProtectedProxyPath('/api' + path)).toBe(true);
  });
  it('uses signed transport peer and ignores forwarding headers', async () => {
    process.env.AUTH_PROXY_SECRET =
      'test-only-transport-secret-at-least-32-characters';
    const f = fixture('/orders', {
      'x-event-login-peer': signLoginPeer(
        '192.0.2.9',
        process.env.AUTH_PROXY_SECRET,
      ),
      'x-forwarded-for': '192.0.2.99',
    });
    await f.guard.canActivate(f.context);
    expect(f.access.limit).toHaveBeenCalledWith('order', 'buyer', '192.0.2.9');
  });
  it('rejects forged attestation before admission or quota calls', async () => {
    const f = fixture('/orders', { 'x-event-login-peer': 'forged' });
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.access.limit).not.toHaveBeenCalled();
  });
  it('returns retry header and does not grant waiting room admission when rate limited', async () => {
    const f = fixture('/orders');
    f.access.limit.mockResolvedValue(12);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 429,
    });
    expect(f.setHeader).toHaveBeenCalledWith('Retry-After', '12');
    expect(f.access.admitted).not.toHaveBeenCalled();
  });
});
