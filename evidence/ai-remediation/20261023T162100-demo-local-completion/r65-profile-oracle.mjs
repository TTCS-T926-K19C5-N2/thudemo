import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(`${process.cwd()}/apps/api/package.json`);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const c = JSON.parse(readFileSync('D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json', 'utf8'));
if (c.profile !== 's1demo-384da3d43b41' || c.database !== 'sprint1_demo_384da3d43b41' || c.ports.postgres < 10000) throw new Error('Refusing unexpected isolated demo profile');
const url = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 1 }) });
try {
  const [events, showtimes, orders, tickets, target] = await Promise.all([
    db.event.count(), db.showtime.count(), db.order.count(), db.ticket.count(),
    db.showtime.findUnique({ where: { id: '914556a8-ba19-4766-9e20-00a3d93df432' }, select: { id: true, status: true, isDemo: true } }),
  ]);
  const result = { profile: c.profile, events, showtimes, orders, tickets, r65FixtureShowtime: target, readOnly: true };
  writeFileSync(new URL('r65-profile-oracle.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); }
