import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'evidence/ai-remediation', runId);
const privateDir = resolve(root, '.cache/ai-remediation', runId);
const state = JSON.parse(readFileSync(resolve(privateDir, 'profile.json'), 'utf8'));
const owner = JSON.parse(readFileSync(resolve(privateDir, 'owner.json'), 'utf8'));
const env = Object.fromEntries(readFileSync(resolve(privateDir, 'compose.env'), 'utf8').trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
if (owner.run_id !== runId || state.run_id !== runId || owner.project !== state.project) throw new Error('Profile ownership mismatch');
const connectionString = `postgresql://remediation:${encodeURIComponent(env.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${state.db.port}/${state.db.database}`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 24 }) });
const fixturePath = resolve(privateDir, 'seat-race-fixture.json');
const resultPath = resolve(evidence, 'seat-race-results.json');
mkdirSync(evidence, { recursive: true });
const action = process.argv[2];

try {
  if (action === 'seed') {
    try { readFileSync(fixturePath); throw new Error('Race fixture exists; refusing reseed'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const role = await db.role.upsert({ where: { name: 'ORGANIZER' }, create: { name: 'ORGANIZER' }, update: {} });
    const buyerRole = await db.role.upsert({ where: { name: 'BUYER' }, create: { name: 'BUYER' }, update: {} });
    const hash = await argon2.hash(randomBytes(32).toString('base64url'));
    const ownerEmail = `race-owner-${runId}@example.invalid`;
    const ownerUser = await db.user.create({ data: { email: ownerEmail, password: hash, isEmailVerified: true, userRoles: { create: { roleId: role.id } } } });
    const emails = Array.from({ length: 200 }, (_, index) => `race-buyer-${runId}-${String(index).padStart(3, '0')}@example.invalid`);
    await db.user.createMany({ data: emails.map((email) => ({ email, password: hash, isEmailVerified: true })) });
    const buyers = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
    await db.userRole.createMany({ data: buyers.map((user) => ({ userId: user.id, roleId: buyerRole.id })) });
    const roles = buyers.map((buyer) => {
      const token = randomBytes(32).toString('base64url');
      return { userId: buyer.id, token, tokenHash: createHash('sha256').update(token).digest('hex') };
    });
    await db.session.createMany({ data: roles.map((session) => ({ userId: session.userId, tokenHash: session.tokenHash, expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000) })) });
    const event = await db.event.create({ data: { name: `Race fixture ${runId}`, description: 'Run-bound 200 requests over 100 seats per round', location: 'Isolated PostgreSQL', status: 'PUBLISHED', organizerId: ownerUser.id } });
    const rounds = [];
    for (let round = 0; round < 10; round++) {
      const showtime = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + (round + 2) * 86400000), status: 'ON_SALE', maxTicketsPerUser: 1 } });
      const category = await db.seatCategory.create({ data: { showtimeId: showtime.id, name: 'Race', price: 1000 } });
      const seats = await db.seat.createManyAndReturn({ data: Array.from({ length: 100 }, (_, index) => ({ showtimeId: showtime.id, categoryId: category.id, row: `R${String(Math.floor(index / 10) + 1).padStart(2, '0')}`, seatNumber: (index % 10) + 1 })) });
      rounds.push({ showtimeId: showtime.id, seatIds: seats.map((seat) => seat.id) });
    }
    const fixture = { runId, eventId: event.id, ownerId: ownerUser.id, buyerIds: buyers.map((user) => user.id), sessions: roles, rounds };
    writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600, flag: 'wx' });
    writeFileSync(resolve(evidence, 'seat-race-fixture-summary.json'), JSON.stringify({ runId, eventId: event.id, rounds: 10, seatsPerRound: 100, requestsPerRound: 200, buyerCount: buyers.length, syntheticOnly: true }, null, 2));
    console.log(JSON.stringify({ seeded: true, rounds: rounds.length, seatsPerRound: 100, buyers: buyers.length }));
  } else if (action === 'run') {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (fixture.runId !== runId || fixture.rounds.length !== 10 || fixture.sessions.length !== 200) throw new Error('Race fixture invalid');
    const raw = [];
    for (let round = 0; round < 10; round++) {
      const current = fixture.rounds[round];
      let ready = 0;
      let release;
      const barrier = new Promise((resolveBarrier) => { release = resolveBarrier; });
      const tasks = Array.from({ length: 200 }, async (_, index) => {
        const seatIndex = Math.floor(index / 2);
        const session = fixture.sessions[index];
        ready++;
        if (ready === 200) release();
        await barrier;
        const startedAt = performance.now();
        const response = await fetch(`http://127.0.0.1:3411/showtimes/${current.showtimeId}/holds`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: `event_session=${session.token}`, origin: 'http://127.0.0.1:3410' },
          body: JSON.stringify({ seatIds: [current.seatIds[seatIndex]] }),
        });
        const body = await response.json().catch(() => null);
        return { round: round + 1, request: index + 1, seatIndex, status: response.status, code: typeof body?.code === 'string' ? body.code : null, latencyMs: performance.now() - startedAt };
      });
      const started = performance.now();
      const requests = await Promise.all(tasks);
      const elapsedMs = performance.now() - started;
      const [oracle] = await db.$queryRaw`SELECT count(*)::int AS "activeHolds", count(DISTINCT h."seatId")::int AS "distinctSeats", count(DISTINCT hs.id)::int AS "holdSessions" FROM seat_holds h JOIN hold_sessions hs ON hs.id=h."holdSessionId" WHERE h."showtimeId"=${current.showtimeId}::uuid AND h."expiresAt">clock_timestamp()`;
      const counts = { success200: requests.filter((request) => request.status === 200).length, conflict409: requests.filter((request) => request.status === 409).length, rateLimited429: requests.filter((request) => request.status === 429).length, otherErrors: requests.filter((request) => ![200, 409, 429].includes(request.status)).length };
      const latencies = requests.map((request) => request.latencyMs).sort((a, b) => a - b);
      const summary = { round: round + 1, workload: { requests: 200, seats: 100, contendersPerSeat: 2, clientBarrierReleased: true }, elapsedMs, counts, sqlOracle: oracle, latencyMs: { p95: latencies[Math.ceil(0.95 * latencies.length) - 1], max: latencies.at(-1) } };
      raw.push({ summary, requests });
      console.log(JSON.stringify(summary));
    }
    const report = { runId, environment: { api: '127.0.0.1:3411', postgres: `127.0.0.1:${state.db.port}`, redis: `127.0.0.1:${state.redis.port}/0`, workers: false, provider: 'not used', rateLimitNoise: '429 counted separately; any nonzero invalidates round', barrier: '200 real HTTP tasks release from an in-process barrier' }, rounds: raw };
    writeFileSync(resultPath, JSON.stringify(report, null, 2));
    const invalid = raw.some(({ summary }) => summary.counts.success200 !== 100 || summary.counts.conflict409 !== 100 || summary.counts.rateLimited429 !== 0 || summary.counts.otherErrors !== 0 || summary.sqlOracle.activeHolds !== 100 || summary.sqlOracle.distinctSeats !== 100);
    if (invalid) process.exitCode = 2;
  } else if (action === 'cleanup') {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (fixture.runId !== runId) throw new Error('Race fixture run-id mismatch');
    const showtimeIds = fixture.rounds.map((round) => round.showtimeId);
    await db.$transaction(async (tx) => {
      await tx.seatHold.deleteMany({ where: { showtimeId: { in: showtimeIds } } });
      await tx.holdSession.deleteMany({ where: { showtimeId: { in: showtimeIds } } });
      await tx.seat.deleteMany({ where: { showtimeId: { in: showtimeIds } } });
      await tx.seatCategory.deleteMany({ where: { showtimeId: { in: showtimeIds } } });
      await tx.showtime.deleteMany({ where: { id: { in: showtimeIds } } });
      await tx.event.deleteMany({ where: { id: fixture.eventId, organizerId: fixture.ownerId } });
      const userIds = [fixture.ownerId, ...fixture.buyerIds];
      await tx.session.deleteMany({ where: { userId: { in: userIds } } });
      await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.catalogRevision.update({ where: { id: 1 }, data: { version: { increment: 1 } } });
    });
    rmSync(fixturePath, { force: true });
    writeFileSync(resolve(evidence, 'seat-race-cleanup.json'), JSON.stringify({ runId, removedShowtimes: showtimeIds.length, removedUsers: fixture.buyerIds.length + 1, appendOnlyAuditPreserved: true }, null, 2));
    console.log(JSON.stringify({ cleaned: true, showtimes: showtimeIds.length, users: fixture.buyerIds.length + 1 }));
  } else throw new Error('Usage: seed|run|cleanup');
} finally { await db.$disconnect(); }
