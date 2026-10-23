import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const privateDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const state = JSON.parse(readFileSync(resolve(privateDir, 'profile.json'), 'utf8'));
const env = Object.fromEntries(readFileSync(resolve(privateDir, 'compose.env'), 'utf8').trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
const owner = JSON.parse(readFileSync(resolve(privateDir, 'owner.json'), 'utf8'));
if (state.run_id !== runId || owner.run_id !== runId || owner.project !== state.project || !env.AI_REMEDIATION_DB_PASSWORD)
  throw new Error('Run-bound profile ownership check failed');
const url = `postgresql://remediation:${encodeURIComponent(env.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${state.db.port}/${state.db.database}`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 3 }) });
const fixturePath = resolve(privateDir, 's11-fixture.json');
const summaryPath = resolve(evidenceDir, 's11-browser-fixture.json');
mkdirSync(evidenceDir, { recursive: true });

try {
  const mode = process.argv[2];
  if (mode === 'seed') {
    try { readFileSync(fixturePath); throw new Error('Fixture already exists; refusing duplicate seed'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const role = await db.role.upsert({ where: { name: 'BUYER' }, create: { name: 'BUYER' }, update: {} });
    const email = `s11-${runId}@example.invalid`;
    const password = randomBytes(24).toString('base64url');
    const buyer = await db.user.create({ data: { email, password: await argon2.hash(password), isEmailVerified: true, userRoles: { create: { roleId: role.id } } } });
    const organizerRole = await db.role.upsert({ where: { name: 'ORGANIZER' }, create: { name: 'ORGANIZER' }, update: {} });
    const organizer = await db.user.create({ data: { email: `s11-owner-${runId}@example.invalid`, password: await argon2.hash(randomBytes(24).toString('base64url')), isEmailVerified: true, userRoles: { create: { roleId: organizerRole.id } } } });
    const event = await db.event.create({ data: { name: `S11 Release Fixture ${runId}`, description: 'Synthetic isolated seat-release browser fixture', location: 'Local test venue', organizerId: organizer.id, status: 'PUBLISHED' } });
    const showtime = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 86400000), status: 'ON_SALE', maxTicketsPerUser: null } });
    const category = await db.seatCategory.create({ data: { showtimeId: showtime.id, name: 'QA', price: 1000 } });
    const seats = await db.seat.createManyAndReturn({ data: [1, 2, 3].map((seatNumber) => ({ showtimeId: showtime.id, categoryId: category.id, row: 'S11', seatNumber, isSold: false })) });
    const fixture = { runId, buyerId: buyer.id, organizerId: organizer.id, eventId: event.id, showtimeId: showtime.id, seatIds: seats.map((seat) => seat.id), email, password };
    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), { mode: 0o600, flag: 'wx' });
    writeFileSync(summaryPath, JSON.stringify({ runId, eventId: event.id, showtimeId: showtime.id, seatCount: seats.length, synthetic: true }, null, 2));
    console.log(JSON.stringify({ seeded: true, eventId: event.id, showtimeId: showtime.id, seatCount: seats.length }));
  } else if (mode === 'cleanup') {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (fixture.runId !== runId) throw new Error('Fixture run-id mismatch');
    await db.$transaction(async (tx) => {
      await tx.seatHold.deleteMany({ where: { showtimeId: fixture.showtimeId } });
      await tx.holdSession.deleteMany({ where: { showtimeId: fixture.showtimeId } });
      await tx.waitlistEntry.deleteMany({ where: { showtimeId: fixture.showtimeId } });
      await tx.waitlistAvailabilitySignal.deleteMany({ where: { showtimeId: fixture.showtimeId } });
      await tx.seat.deleteMany({ where: { showtimeId: fixture.showtimeId } });
      await tx.seatCategory.deleteMany({ where: { showtimeId: fixture.showtimeId } });
      await tx.showtime.delete({ where: { id: fixture.showtimeId } });
      await tx.event.delete({ where: { id: fixture.eventId, organizerId: fixture.organizerId } });
      await tx.session.deleteMany({ where: { userId: { in: [fixture.buyerId, fixture.organizerId] } } });
      await tx.user.deleteMany({ where: { id: { in: [fixture.buyerId, fixture.organizerId] } } });
    });
    const remaining = {
      events: await db.event.count({ where: { id: fixture.eventId } }),
      showtimes: await db.showtime.count({ where: { id: fixture.showtimeId } }),
      users: await db.user.count({ where: { id: { in: [fixture.buyerId, fixture.organizerId] } } }),
      holds: await db.seatHold.count({ where: { showtimeId: fixture.showtimeId } }),
    };
    if (Object.values(remaining).some((count) => count !== 0))
      throw new Error('Run-bound fixture cleanup oracle found remaining rows');
    rmSync(fixturePath, { force: true });
    writeFileSync(resolve(evidenceDir, 's11-browser-fixture-cleanup.json'), JSON.stringify({ runId, fixtureEventId: fixture.eventId, fixtureShowtimeId: fixture.showtimeId, removed: true, remaining }, null, 2));
    console.log(JSON.stringify({ cleaned: true, remaining }));
  } else if (mode === 'reset-password') {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const password = process.env.AI_REMEDIATION_S11_PASSWORD;
    if (fixture.runId !== runId || typeof password !== 'string' || password.length < 12)
      throw new Error('Run-bound fixture or local password input is invalid');
    await db.user.update({ where: { id: fixture.buyerId }, data: { password: await argon2.hash(password) } });
    fixture.password = password;
    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ passwordReset: true, fixtureRunId: runId }));
  } else throw new Error('Use seed or cleanup');
} finally {
  await db.$disconnect();
}
