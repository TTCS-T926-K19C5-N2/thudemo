import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(`${process.cwd()}/apps/api/package.json`);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const argon2 = require('argon2');
const Redis = require('ioredis');
const root = 'D:/Merge_2/Codegym-demo-proof-20261023T1530';
const c = JSON.parse(readFileSync(`${root}/.sprint1-demo/config.json`, 'utf8'));
const url = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || url.hostname !== '127.0.0.1' || url.port !== String(c.ports.postgres) || url.pathname !== `/${c.database}` || decodeURIComponent(url.username) !== c.user || decodeURIComponent(url.password) !== c.dbPassword) throw new Error('Exact local demo DB guard failed');

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 1 }) });
const redis = new Redis(`redis://127.0.0.1:${c.ports.redis}`, { maxRetriesPerRequest: 1, lazyConnect: true });
const digest = (x) => createHash('sha256').update(x).digest('hex');
try {
  const buyers = [];
  for (const a of c.accounts.filter((x) => x.roles.includes('BUYER'))) {
    const u = await db.user.findUnique({ where: { email: a.email }, select: { password: true, isEmailVerified: true, isActive: true, userRoles: { select: { role: { select: { name: true } } } } } });
    const lock = await redis.get(`auth:lock:${digest(a.email)}`);
    const fail = await redis.get(`auth:fail:${digest(a.email)}`);
    buyers.push({ account: a.name, userExists: !!u, passwordMatchesConfig: !!u && await argon2.verify(u.password, a.password), emailVerified: u?.isEmailVerified, active: u?.isActive, roles: u?.userRoles.map((x) => x.role.name), lockPresent: !!lock, lockTtlSeconds: lock ? await redis.ttl(`auth:lock:${digest(a.email)}`) : 0, failureCount: Number(fail ?? 0) });
  }
  console.log(JSON.stringify({ profile: c.profile, buyers }));
} finally {
  await db.$disconnect();
  redis.disconnect();
}
