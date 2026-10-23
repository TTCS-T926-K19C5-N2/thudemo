import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const stateDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const state = JSON.parse(readFileSync(resolve(stateDir, 'profile.json'), 'utf8'));
const owner = JSON.parse(readFileSync(resolve(stateDir, 'owner.json'), 'utf8'));
if (state.run_id !== runId || owner.run_id !== runId || owner.project !== state.project)
  throw new Error('Run-bound profile ownership check failed');
const env = Object.fromEntries(readFileSync(resolve(stateDir, 'compose.env'), 'utf8').trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
const url = `postgresql://remediation:${encodeURIComponent(env.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${state.db.port}/codegym_remediation`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4 }) });
const redis = new Redis({ host: '127.0.0.1', port: state.redis.port, db: 0, lazyConnect: true });
const fixturePath = resolve(stateDir, 's40-browser-fixture.json');
const publicPath = resolve(evidenceDir, 's40-browser-fixture-summary.json');
mkdirSync(evidenceDir, { recursive: true });

try {
  const mode = process.argv[2];
  if (mode === 'seed') {
    try { readFileSync(fixturePath); throw new Error('Fixture already exists; refusing duplicate seed'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await redis.connect();
    const role = await db.role.upsert({ where: { name: 'BUYER' }, create: { name: 'BUYER' }, update: {} });
    const users = [];
    for (const label of ['desktop', 'mobile', 'error']) {
      const token = randomBytes(32).toString('base64url');
      const user = await db.user.create({
        data: {
          email: `s40-${label}-${runId}@example.invalid`,
          password: randomBytes(32).toString('base64url'),
          isEmailVerified: true,
          userRoles: { create: { roleId: role.id } },
          sessions: { create: { tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 15 * 60_000) } },
        },
      });
      users.push({ id: user.id, token });
    }
    const organizerRole = await db.role.upsert({ where: { name: 'ORGANIZER' }, create: { name: 'ORGANIZER' }, update: {} });
    const organizer = await db.user.create({
      data: { email: `s40-organizer-${runId}@example.invalid`, password: randomBytes(32).toString('base64url'), isEmailVerified: true, userRoles: { create: { roleId: organizerRole.id } } },
    });
    const event = await db.event.create({ data: { name: `S40 browser fixture ${runId}`, description: 'Synthetic run-bound waiting room browser fixture', location: 'Local test venue', organizerId: organizer.id, status: 'PUBLISHED' } });
    const showtime = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 48 * 60 * 60_000), status: 'ON_SALE' } });
    const category = await db.seatCategory.create({ data: { showtimeId: showtime.id, name: 'Fixture', price: 1000 } });
    await db.seat.createMany({ data: [1, 2].map((seatNumber) => ({ showtimeId: showtime.id, categoryId: category.id, row: 'QA', seatNumber, isSold: false })) });
    const fixture = { runId, eventId: event.id, showtimeId: showtime.id, organizerId: organizer.id, userIds: users.map((u) => u.id), users };
    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), { flag: 'wx', mode: 0o600 });
    writeFileSync(publicPath, JSON.stringify({ runId, eventId: event.id, showtimeId: showtime.id, buyerCount: users.length, syntheticOnly: true }, null, 2) + '\n');
    console.log('S-40 browser fixture seeded in isolated remediation profile.');
  } else if (mode === 'cleanup') {
    const f = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (f.runId !== runId || !f.userIds?.length || !f.showtimeId) throw new Error('Fixture ownership check failed');
    await redis.connect();
    const pattern = `booking:test:{${f.showtimeId}}:*`;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.unlink(...keys);
    } while (cursor !== '0');
    await db.$transaction(async (tx) => {
      await tx.seat.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.seatCategory.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.showtime.deleteMany({ where: { id: f.showtimeId, eventId: f.eventId } });
      await tx.event.deleteMany({ where: { id: f.eventId, organizerId: f.organizerId } });
      await tx.session.deleteMany({ where: { userId: { in: [...f.userIds, f.organizerId] } } });
      await tx.userRole.deleteMany({ where: { userId: { in: [...f.userIds, f.organizerId] } } });
      await tx.user.deleteMany({ where: { id: { in: [...f.userIds, f.organizerId] } } });
    });
    rmSync(fixturePath, { force: true });
    writeFileSync(resolve(evidenceDir, 's40-browser-fixture-cleanup.json'), JSON.stringify({ runId, cleaned: true, eventId: f.eventId, showtimeId: f.showtimeId, userCount: f.userIds.length + 1, redisPattern: pattern }, null, 2) + '\n');
    console.log('S-40 browser fixture and exact run-bound Redis keys cleaned.');
  } else throw new Error('Expected seed or cleanup');
} finally {
  await redis.quit().catch(() => {});
  await db.$disconnect();
}
