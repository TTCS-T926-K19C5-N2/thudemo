import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async ping(): Promise<void> {
    if (this.redis.status !== 'ready') {
      throw new Error('Redis is unavailable');
    }
    const result = await Promise.race([
      this.redis.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1000)),
    ]);
    if (result !== 'PONG') {
      throw new Error('Redis is unavailable');
    }
  }

  async incrementLoginFailures(email: string): Promise<number> {
    const key = `login_fails:${email}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      // First failure, set expiration to 15 minutes
      await this.redis.expire(key, 15 * 60);
    }
    return count;
  }

  async getLoginFailures(email: string): Promise<number> {
    const key = `login_fails:${email}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  async clearLoginFailures(email: string): Promise<void> {
    const key = `login_fails:${email}`;
    await this.redis.del(key);
  }

  async lockAccount(email: string): Promise<void> {
    const key = `lock_account:${email}`;
    // Lock for 15 minutes
    await this.redis.set(key, 'locked', 'EX', 15 * 60);
  }

  async isAccountLocked(email: string): Promise<boolean> {
    const key = `lock_account:${email}`;
    const isLocked = await this.redis.get(key);
    return isLocked === 'locked';
  }

  async getLockTTL(email: string): Promise<number> {
    const key = `lock_account:${email}`;
    return this.redis.ttl(key);
  }
}
