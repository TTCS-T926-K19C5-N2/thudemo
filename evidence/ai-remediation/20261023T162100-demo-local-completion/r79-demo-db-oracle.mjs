import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { PrismaClient } from '../../../apps/api/node_modules/@prisma/client/index.js';
import { PrismaPg } from '../../../apps/api/node_modules/@prisma/adapter-pg/dist/index.js';

const preparedRoot = 'D:/Merge_2/Codegym-demo-proof-20261023T1530';
const env = parseEnv(readFileSync(`${preparedRoot}/.env`, 'utf8'));
if (!env.SPRINT1_DEMO_PROFILE || !env.DATABASE_URL?.includes('127.0.0.1:15460')) {
  throw new Error('Refusing oracle query: isolated profile guard failed');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
try {
  await prisma.$connect();
  const [events, showtimes, orders, tickets, seats, activeHolds, orderStatuses] =
    await Promise.all([
      prisma.event.count(),
      prisma.showtime.count(),
      prisma.order.count(),
      prisma.ticket.count(),
      prisma.seat.count(),
      prisma.seatHold.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
  const result = {
    runId: '20261023T162100-demo-local-completion',
    checkpoint: 'R79',
    profile: 'isolated local demo; values redacted',
    operation: 'read-only PostgreSQL aggregate oracle after official Restart',
    events,
    showtimes,
    orders,
    tickets,
    seats,
    activeHolds,
    orderStatuses: Object.fromEntries(
      orderStatuses.map((row) => [row.status, row._count._all]),
    ),
    result: 'PASS',
  };
  writeFileSync(
    new URL('./r79-demo-db-oracle.json', import.meta.url),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
} finally {
  await prisma.$disconnect();
}
