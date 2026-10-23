import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(`${process.cwd()}/apps/api/package.json`);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const c = JSON.parse(readFileSync('D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json', 'utf8'));
const p = fileURLToPath(new URL('r53-fixture.json', import.meta.url));
const f = JSON.parse(readFileSync(p, 'utf8'));
if (f.profile !== c.profile || !/^R53-\d+$/.test(f.runId) || f.showtimeId !== '914556a8-ba19-4766-9e20-00a3d93df432' || !/^[0-9a-f-]{36}$/i.test(f.holdSessionId) || !/^[0-9a-f-]{36}$/i.test(f.ownerId) || !/^[0-9a-f-]{36}$/i.test(f.seatId)) throw new Error('R53 exact-fixture guard failed');
const url = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (url.hostname !== '127.0.0.1' || url.port !== String(c.ports.postgres) || url.pathname !== `/${c.database}`) throw new Error('DB target guard failed');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 1 }) });
const counts = async () => ({ orders: await db.order.count(), tickets: await db.ticket.count(), activeShowtimeHolds: await db.seatHold.count({ where: { showtimeId: f.showtimeId, expiresAt: { gt: new Date() } } }), holdSessions: await db.holdSession.count({ where: { showtimeId: f.showtimeId } }) });
try {
  const before = await counts();
  const session = await db.holdSession.findUnique({ where: { id: f.holdSessionId }, include: { seats: true, orders: { select: { id: true } } } });
  let deleted = 0;
  if (session) {
    if (session.showtimeId !== f.showtimeId || session.userId !== f.ownerId || session.seats.length !== 0 || session.orders.length !== 0 || session.expectedSeatIds.length !== 0) throw new Error('Cleanup refused: exact session has ownership mismatch or live business links');
    deleted = (await db.holdSession.deleteMany({ where: { id: f.holdSessionId, showtimeId: f.showtimeId, userId: f.ownerId, seats: { none: {} }, orders: { none: {} }, expectedSeatIds: { isEmpty: true } } })).count;
  }
  const after = await counts();
  const output = { runId: f.runId, exactSessionMatched: !!session, exactOrphanSessionDeleted: deleted, before, after, countsRestored: JSON.stringify(after) === JSON.stringify(f.before), seatFree: await db.seat.count({ where: { id: f.seatId, isSold: false, hold: null } }) === 1 };
  writeFileSync(fileURLToPath(new URL('r53-cleanup-verification.json', import.meta.url)), `${JSON.stringify(output, null, 2)}\n`);
  const resultPath = fileURLToPath(new URL('r53-cross-buyer-hold-refresh.json', import.meta.url));
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  result.businessCountsAfterCleanup = after;
  result.countsRestored = output.countsRestored;
  result.exactFixtureCleanup = 'UI release removed the active seat hold; this script removed only the R53-created HoldSession after proving it had no held seats or linked orders.';
  result.evidence.push('r53-cleanup-verification.json');
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(output));
} finally { await db.$disconnect(); }
