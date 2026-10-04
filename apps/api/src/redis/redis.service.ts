import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

function accountKey(prefix: string, email: string): string {
  const digest = createHash('sha256').update(email).digest('hex');
  return `auth:${prefix}:${digest}`;
}

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async ping(): Promise<void> {
    if (this.redis.status !== 'ready') {
      throw new Error('Redis is unavailable');
    }
    const result = await Promise.race([
      this.redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), 1000),
      ),
    ]);
    if (result !== 'PONG') {
      throw new Error('Redis is unavailable');
    }
  }

  async incrementLoginFailures(email: string): Promise<number> {
    const key = accountKey('fail', email);
    const count = await this.redis.eval(
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
      1,
      key,
      15 * 60,
    );
    return Number(count);
  }

  async getLoginFailures(email: string): Promise<number> {
    const key = accountKey('fail', email);
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  async clearLoginFailures(email: string): Promise<void> {
    const key = accountKey('fail', email);
    await this.redis.del(key);
  }

  async lockAccount(email: string): Promise<void> {
    const key = accountKey('lock', email);
    await this.redis.set(key, 'locked', 'EX', 15 * 60);
  }

  async isAccountLocked(email: string): Promise<boolean> {
    const key = accountKey('lock', email);
    const isLocked = await this.redis.get(key);
    return isLocked === 'locked';
  }

  async getLockTTL(email: string): Promise<number> {
    const key = accountKey('lock', email);
    return this.redis.ttl(key);
  }
}
