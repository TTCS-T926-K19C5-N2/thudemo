import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

const emails = ['nguyenthuytrang1582006@gmail.com', 'duongthutrang2912@gmail.com'];
const key = (kind, identity) => `auth:${kind}:${createHash('sha256').update(identity).digest('hex')}`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { maxRetriesPerRequest: 1 });
redis.on('error', () => {});
try {
  for (const email of emails) {
    const users = await db.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { isActive: true, isEmailVerified: true }, take: 2,
    });
    const lockKey = key('lock', email);
    const failKey = key('fail', email);
    console.log(JSON.stringify({ email, accounts: users, lock: await redis.get(lockKey),
      lockSeconds: await redis.ttl(lockKey), failures: Number(await redis.get(failKey) ?? 0) }));
    if (process.argv.includes('--unlock') && users.length === 1 && users[0].isActive) {
      console.log(JSON.stringify({ email, clearedKeys: await redis.del(lockKey, failKey),
        stillLocked: await redis.exists(lockKey) }));
    }
  }
  for (const ip of ['127.0.0.1', '::1']) {
    const ipKey = key('ip-fail', ip);
    const failures = Number(await redis.get(ipKey) ?? 0);
    console.log(JSON.stringify({ localIp: ip, failures, seconds: await redis.ttl(ipKey) }));
    if (process.argv.includes('--unlock') && failures >= 30)
      console.log(JSON.stringify({ localIp: ip, clearedKeys: await redis.del(ipKey), remaining: await redis.exists(ipKey) }));
  }
} catch (error) {
  console.error(JSON.stringify({ error: 'Local account diagnostic failed', code: error.code ?? 'UNKNOWN' }));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
  redis.disconnect();
}
