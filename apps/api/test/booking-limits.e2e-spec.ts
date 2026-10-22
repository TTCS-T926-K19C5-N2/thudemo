import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { BookingAccessService } from '../src/booking-access/booking-access.service.js';
import { assertIntegrationDatabase } from './integration-database.js';

describe('S41 real shared-network booking limits', () => {
  let redis: Redis;
  const profile = `limit-fixture-${randomUUID()}`;
  beforeAll(() => {
    assertIntegrationDatabase();
    for (const route of ['HOLD', 'ORDER'])
      for (const scope of ['ACCOUNT', 'IP'])
        vi.stubEnv(`BOOKING_${route}_${scope}_LIMIT`, undefined);
    const url = new URL(
      process.env.REDIS_URL ??
        `redis://${process.env.REDIS_HOST ?? '127.0.0.1'}:${process.env.REDIS_PORT ?? '6379'}`,
    );
    if (
      url.hostname !== '127.0.0.1' ||
      !['16462', '6379', '16382'].includes(url.port)
    )
      throw Error('Dedicated integration Redis required');
    redis = new Redis(url.href);
  });
  afterAll(async () => {
    if (!redis) return;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `booking:${profile}:*`,
        'COUNT',
        100,
      );
      if (keys.length) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
    await redis.quit();
    vi.unstubAllEnvs();
  });
  const service = (config: Record<string, string> = {}) =>
    new BookingAccessService(
      redis,
      new ConfigService({ APP_ENV: profile, ...config }),
    );
  it('allows 200 buyers sharing an IP to make ten hold requests each, while retaining the account cap', async () => {
    const access = service();
    for (let turn = 0; turn < 10; turn++)
      expect(
        await Promise.all(
          Array.from({ length: 200 }, (_, i) =>
            access.limit('hold', `buyer-${i}`, '192.0.2.1'),
          ),
        ),
      ).toEqual(Array(200).fill(0));
    for (let turn = 10; turn < 60; turn++)
      expect(await access.limit('hold', 'buyer-0', '192.0.2.1')).toBe(0);
    expect(await access.limit('hold', 'buyer-0', '192.0.2.1')).toBeGreaterThan(
      0,
    );
  });
  it('still applies the configured IP ceiling independently of account identity', async () => {
    const access = service({ BOOKING_ORDER_IP_LIMIT: '3' });
    for (let i = 0; i < 3; i++)
      expect(await access.limit('order', `order-buyer-${i}`, '192.0.2.2')).toBe(
        0,
      );
    expect(
      await access.limit('order', 'another-account', '192.0.2.2'),
    ).toBeGreaterThan(0);
  });
  it('does not reopen an exhausted budget during the last fractional second', async () => {
    const access = service({ BOOKING_HOLD_ACCOUNT_LIMIT: '1' });
    const user = 'last-fractional-second';
    expect(await access.limit('hold', user, '192.0.2.3')).toBe(0);
    const key = `booking:${profile}:limit:hold:user:${createHash('sha256').update(user).digest('hex')}`;
    await redis.pexpire(key, 400);
    expect(await access.limit('hold', user, '192.0.2.3')).toBeGreaterThan(0);
    expect(await redis.get(key)).toBe('1');
  });
});
