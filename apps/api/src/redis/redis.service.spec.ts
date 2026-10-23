import { vi } from 'vitest';
import type { Redis } from 'ioredis';
import { RedisService } from './redis.service.js';
describe('Shared login counters', () => {
  it('opens under budget, returns bounded TTL when locked and hashes the peer key', async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      ttl: vi.fn().mockResolvedValue(899),
      eval: vi.fn().mockResolvedValue(1),
    };
    const service = new RedisService(redis as unknown as Redis);
    expect(await service.loginIpRetryAfter('192.0.2.1')).toBe(0);
    redis.get.mockResolvedValue('29');
    expect(await service.loginIpRetryAfter('192.0.2.1')).toBe(0);
    redis.get.mockResolvedValue('30');
    expect(await service.loginIpRetryAfter('192.0.2.1')).toBe(899);
    redis.ttl.mockResolvedValue(-1);
    expect(await service.loginIpRetryAfter('192.0.2.1')).toBe(1);
    await service.recordLoginIpFailure('192.0.2.1');
    expect(redis.eval.mock.calls[0][0]).toContain(
      "if n == 1 then redis.call('EXPIRE', KEYS[1], 900)",
    );
    expect(redis.eval.mock.calls[0][2]).toMatch(/^auth:ip-fail:[a-f0-9]{64}$/);
  });
});
