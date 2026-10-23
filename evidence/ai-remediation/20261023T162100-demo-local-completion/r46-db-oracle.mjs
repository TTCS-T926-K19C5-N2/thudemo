import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const root = realpathSync(resolve(import.meta.dirname, '../../../..'));
const config = JSON.parse(readFileSync(resolve(root, '.sprint1-demo/config.json'), 'utf8'));
const url = new URL(process.env.DATABASE_URL ?? '');
if (
  config.root !== root ||
  process.env.SPRINT1_DEMO_PROFILE !== config.profile ||
  url.hostname !== '127.0.0.1' ||
  url.port !== String(config.ports.postgres) ||
  url.pathname !== `/${config.database}` ||
  decodeURIComponent(url.username) !== config.user ||
  decodeURIComponent(url.password) !== config.dbPassword
) throw new Error('Refusing non-owned demo database target.');

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
try {
  const [events, showtimes, orders, tickets] = await Promise.all([
    db.event.count(),
    db.showtime.count(),
    db.order.count(),
    db.ticket.count(),
  ]);
  console.log(JSON.stringify({ profile: config.profile, database: config.database, events, showtimes, orders, tickets, readOnly: true }));
} finally {
  await db.$disconnect();
}
