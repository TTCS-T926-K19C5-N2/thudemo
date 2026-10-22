import { randomUUID, createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';

describe('Sprint1 shared login IP budget (real Redis)', () => {
  let app: INestApplication;
  let redis: Redis;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    redis = app.get<Redis>('REDIS_CLIENT');
  });
  afterAll(async () => app.close());
  it('counts rotated accounts, expires in Redis and isolates peer budgets', async () => {
    const service = app.get(AuthService),
      peer = `fixture-ip-${randomUUID()}`;
    const key =
      'auth:ip-fail:' + createHash('sha256').update(peer).digest('hex');
    try {
      for (let n = 0; n < 30; n++)
        await expect(
          service.login(`${randomUUID()}@demo.invalid`, 'incorrect', peer),
        ).rejects.toMatchObject({ status: 401 });
      await expect(
        service.login(`${randomUUID()}@demo.invalid`, 'incorrect', peer),
      ).rejects.toMatchObject({ status: 429 });
      expect(await redis.ttl(key)).toBeGreaterThan(850);
      expect(await redis.ttl(key)).toBeLessThanOrEqual(900);
      await expect(
        service.login(
          `${randomUUID()}@demo.invalid`,
          'incorrect',
          `${peer}-other`,
        ),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      await redis.del(key);
    }
  });
});
