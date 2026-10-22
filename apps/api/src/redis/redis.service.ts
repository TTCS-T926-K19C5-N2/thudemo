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

  // A separate shared budget prevents rotating email addresses from bypassing
  // account lockout. Use the transport peer only; forwarded headers are untrusted.
  async loginIpRetryAfter(ip: string): Promise<number> {
    const key = accountKey('ip-fail', ip);
    const count = Number((await this.redis.get(key)) ?? 0);
    return count >= 30 ? Math.max(1, await this.redis.ttl(key)) : 0;
  }

  async recordLoginIpFailure(ip: string): Promise<void> {
    await this.redis.eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 900); end; return n",
      1,
      accountKey('ip-fail', ip),
    );
  }

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

  async reserveActivationResend(
    email: string,
  ): Promise<{ count: number; ttl: number }> {
    const result = (await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600); end; return {n,redis.call('TTL',KEYS[1])}",
      1,
      accountKey('activation-resend', email),
    )) as [number, number];
    return { count: Number(result[0]), ttl: Math.max(1, Number(result[1])) };
  }

  // Shared across replicas, recipients and both public mail-producing routes.
  // Bounds accepted SMTP/outbox/Argon2 work without restricting email domains.
  async reserveRegistrationDelivery(): Promise<{ count: number; ttl: number }> {
    const result = (await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600); end; return {n,redis.call('TTL',KEYS[1])}",
      1,
      'auth:registration-delivery:hour',
    )) as [number, number];
    return { count: Number(result[0]), ttl: Math.max(1, Number(result[1])) };
  }

  async reserveRegistrationCaller(
    ip: string,
  ): Promise<{ count: number; ttl: number }> {
    const result = (await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600); end; return {n,redis.call('TTL',KEYS[1])}",
      1,
      accountKey('registration-caller', ip),
    )) as [number, number];
    return { count: Number(result[0]), ttl: Math.max(1, Number(result[1])) };
  }
}
