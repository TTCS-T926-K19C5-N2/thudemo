import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const stateDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const state = JSON.parse(readFileSync(resolve(stateDir, 'profile.json'), 'utf8'));
const owner = JSON.parse(readFileSync(resolve(stateDir, 'owner.json'), 'utf8'));
if (state.run_id !== runId || owner.run_id !== runId || owner.project !== state.project) throw new Error('Run-bound profile ownership check failed');
const privateEnv = Object.fromEntries(readFileSync(resolve(stateDir, 'compose.env'), 'utf8').trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
const dbUrl = `postgresql://remediation:${encodeURIComponent(privateEnv.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${state.db.port}/codegym_remediation`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl, max: 4 }) });
const fixturePath = resolve(stateDir, 's63-fixture.json');
const publicPath = resolve(evidenceDir, 's63-fixture-summary.json');
const mode = process.argv[2];
try {
  if (mode === 'seed') {
    try { readFileSync(fixturePath); throw new Error('S-63 fixture exists; refusing duplicate seed'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const role = await db.role.upsert({ where: { name: 'ORGANIZER' }, create: { name: 'ORGANIZER' }, update: {} });
    const password = `S63fixture!${randomBytes(12).toString('hex')}`;
    const token = randomBytes(32).toString('base64url');
    const organizer = await db.user.create({ data: {
      email: `s63-organizer-${runId}@example.invalid`, password: await argon2.hash(password), isEmailVerified: true,
      userRoles: { create: { roleId: role.id } },
      sessions: { create: { tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 2 * 86400000) } },
    } });
    const event = await db.event.create({ data: { name: `S63 synthetic ${runId}`, description: 'Run-bound analytics fixture', location: 'Local test venue', status: 'PUBLISHED', organizerId: organizer.id } });
    const showtime = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 10 * 86400000), status: 'ON_SALE' } });
    const category = await db.seatCategory.create({ data: { showtimeId: showtime.id, name: 'Fixture', price: 1000 } });
    await db.seat.createMany({ data: Array.from({ length: 15 }, (_, i) => ({ showtimeId: showtime.id, categoryId: category.id, row: 'S63', seatNumber: i + 1 })) });
    const seats = await db.seat.findMany({ where: { showtimeId: showtime.id }, orderBy: { seatNumber: 'asc' } });
    const calendarDate = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const fromDate = calendarDate(new Date(Date.now() - 30 * 86400000));
    const todayDate = calendarDate(new Date());
    const fromBoundary = new Date(`${fromDate}T00:00:00+07:00`);
    const toBoundary = new Date(`${todayDate}T00:00:00+07:00`);
    toBoundary.setUTCDate(toBoundary.getUTCDate() + 1);
    const cohortStart = Date.now() - 12 * 3600000;
    const sessions = [];
    for (let i = 0; i < 10; i++) {
      const id = randomUUID();
      const startedAt = i === 0 ? fromBoundary : new Date(cohortStart + i * 15 * 60000);
      const expiresAt = i === 9 ? new Date(Date.now() + 3 * 86400000) : i < 5 ? new Date(Date.now() + 6 * 3600000) : new Date(Date.now() - 3600000);
      const holdToken = randomUUID();
      const hold = await db.holdSession.create({ data: {
        id, showtimeId: showtime.id, userId: organizer.id, sessionHash: `s63:${runId}:${i}`, token: holdToken,
        expectedSeatIds: i === 0 ? [seats[i].id, seats[10].id] : [seats[i].id], expiresAt, createdAt: startedAt,
      } });
      await db.seatHold.create({ data: { seatId: seats[i].id, showtimeId: showtime.id, holdSessionId: hold.id, token: holdToken, expiresAt, acquiredAt: startedAt } });
      if (i === 0) await db.seatHold.create({ data: { seatId: seats[10].id, showtimeId: showtime.id, holdSessionId: hold.id, token: holdToken, expiresAt, acquiredAt: startedAt } });
      sessions.push({ hold, holdToken, seat: seats[i], startedAt, expiresAt });
    }
    const endBoundary = await db.holdSession.create({ data: {
      showtimeId: showtime.id, userId: organizer.id, sessionHash: `s63:${runId}:to-boundary`,
      token: randomUUID(), expectedSeatIds: [], expiresAt: new Date(toBoundary.getTime() + 3600000), createdAt: toBoundary,
    } });
    const orders = [];
    for (const i of [0, 1, 2, 3, 4]) {
      const x = sessions[i];
      const order = await db.order.create({ data: {
        userId: organizer.id, eventId: event.id, showtimeId: showtime.id,
        holdSessionId: x.hold.id, holdToken: x.holdToken,
        status: i < 3 ? 'PAID' : i === 3 ? 'PENDING_PAYMENT' : 'EXPIRED',
        paymentExpiresAt: x.expiresAt, expiresAt: x.expiresAt, totalAmount: 1000,
        createdAt: new Date(x.startedAt.getTime() + (i + 1) * 60000),
        items: { create: [{ seatId: x.seat.id, categoryName: 'Fixture', unitPrice: 1000 }, ...(i === 0 ? [{ seatId: seats[10].id, categoryName: 'Fixture', unitPrice: 1000 }] : [])] },
      } });
      orders.push(order.id);
    }
    const fixture = { runId, eventId: event.id, showtimeId: showtime.id, organizerId: organizer.id, email: organizer.email, password, token, sessionIds: [...sessions.map((s) => s.hold.id), endBoundary.id], cohortSessionIds: sessions.map((s) => s.hold.id), endBoundarySessionId: endBoundary.id, seatIds: sessions.map((s) => s.seat.id), orderIds: orders };
    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), { flag: 'wx', mode: 0o600 });
    writeFileSync(publicPath, JSON.stringify({ runId, eventId: event.id, showtimeId: showtime.id, cohortSessionCount: 10, endBoundarySentinelCount: 1, inclusiveStartBoundary: fromBoundary.toISOString(), exclusiveEndBoundary: toBoundary.toISOString(), orderCount: 5, paidCount: 3, expiredSessionCount: 5, pendingAtCutoff: 1, multiSeatHoldSample: true, syntheticOnly: true }, null, 2) + '\n');
    console.log('S-63 run-bound fixture seeded; private credentials remain in local fixture file.');
  } else if (mode === 'cleanup') {
    const f = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (f.runId !== runId || !f.sessionIds?.length || !f.showtimeId) throw new Error('Fixture ownership check failed');
    await db.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { orderId: { in: f.orderIds } } });
      await tx.orderItem.deleteMany({ where: { orderId: { in: f.orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: f.orderIds }, showtimeId: f.showtimeId, userId: f.organizerId } });
      await tx.seatHold.deleteMany({ where: { holdSessionId: { in: f.sessionIds } } });
      await tx.holdSession.deleteMany({ where: { id: { in: f.sessionIds }, showtimeId: f.showtimeId, userId: f.organizerId } });
      await tx.seat.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.seatCategory.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.showtime.deleteMany({ where: { id: f.showtimeId, eventId: f.eventId } });
      await tx.event.deleteMany({ where: { id: f.eventId, organizerId: f.organizerId } });
      await tx.session.deleteMany({ where: { userId: f.organizerId } });
      await tx.userRole.deleteMany({ where: { userId: f.organizerId } });
      await tx.user.deleteMany({ where: { id: f.organizerId } });
    });
    const immutableAuditCount = await db.domainAudit.count({ where: { entityId: { in: [...f.sessionIds, ...f.orderIds] } } });
    const { rmSync } = await import('node:fs');
    rmSync(fixturePath, { force: true });
    writeFileSync(resolve(evidenceDir, 's63-fixture-cleanup.json'), JSON.stringify({ runId, cleaned: true, eventId: f.eventId, showtimeId: f.showtimeId, sessionCount: f.sessionIds.length, orderCount: f.orderIds.length, immutableAuditRowsRetained: immutableAuditCount }, null, 2) + '\n');
    console.log('S-63 mutable fixture rows cleaned; append-only audit facts retained by database policy.');
  } else throw new Error('Expected seed or cleanup');
} finally { await db.$disconnect(); }
