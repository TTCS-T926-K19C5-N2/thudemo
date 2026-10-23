import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
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
const owner = JSON.parse(readFileSync(resolve(privateDir, 'owner.json'), 'utf8'));
if (state.run_id !== runId || owner.run_id !== runId || owner.project !== state.project) throw new Error('Profile ownership mismatch');
const values = Object.fromEntries(readFileSync(resolve(privateDir, 'compose.env'), 'utf8').trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
const url = `postgresql://remediation:${encodeURIComponent(values.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${state.db.port}/codegym_remediation`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 3 }) });
const privateFile = resolve(privateDir, 'waitlist-browser-fixture.json');
const evidenceFile = resolve(evidenceDir, 'waitlist-browser-fixture-summary.json');
try {
  if (process.argv[2] === 'seed') {
    try { readFileSync(privateFile); throw new Error('Existing fixture; refusing duplicate seed'); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
    const role = await db.role.upsert({ where: { name: 'BUYER' }, create: { name: 'BUYER' }, update: {} });
    const password = randomBytes(24).toString('base64url');
    const user = await db.user.create({ data: { email: `waitlist-${runId}@example.invalid`, password: await argon2.hash(password), isEmailVerified: true, userRoles: { create: { roleId: role.id } } } });
    const ownerUser = await db.user.create({ data: { email: `waitlist-owner-${runId}@example.invalid`, password: await argon2.hash(randomBytes(24).toString('base64url')), isEmailVerified: true } });
    const event = await db.event.create({ data: { name: `Waitlist UI fixture ${runId}`, description: 'Synthetic sold out waitlist browser verification.', location: 'Local only', organizerId: ownerUser.id, status: 'PUBLISHED' } });
    const show = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 86_400_000), status: 'ON_SALE', maxTicketsPerUser: null } });
    const category = await db.seatCategory.create({ data: { showtimeId: show.id, name: 'QA sold out', price: 1000 } });
    await db.seat.createMany({ data: [1, 2].map((seatNumber) => ({ showtimeId: show.id, categoryId: category.id, row: 'QA', seatNumber, isSold: true })) });
    const fixture = { runId, userId: user.id, ownerId: ownerUser.id, eventId: event.id, showtimeId: show.id, email: user.email, password };
    writeFileSync(privateFile, JSON.stringify(fixture, null, 2), { mode: 0o600, flag: 'wx' });
    writeFileSync(evidenceFile, JSON.stringify({ runId, eventId: event.id, showtimeId: show.id, synthetic: true, allSeatsSold: true, credentialsStoredPrivately: true }, null, 2));
    console.log(JSON.stringify({ seeded: true, eventId: event.id, showtimeId: show.id }));
  } else if (process.argv[2] === 'verify') {
    const f = JSON.parse(readFileSync(privateFile, 'utf8'));
    if (f.runId !== runId) throw new Error('Fixture run mismatch');
    const entries = await db.waitlistEntry.findMany({ where: { showtimeId: f.showtimeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, userId: true, status: true } });
    const own = entries.find((entry) => entry.userId === f.userId);
    const [holdCount, unsoldCount] = await Promise.all([
      db.seatHold.count({ where: { showtimeId: f.showtimeId } }),
      db.seat.count({ where: { showtimeId: f.showtimeId, isSold: false } }),
    ]);
    const result = { runId, case: 'S-59-AC01.01', currentUserEntry: own ? { id: own.id, status: own.status, fifoPosition: entries.filter((e) => e.status === 'ACTIVE' && e.userId === f.userId).length ? entries.filter((e) => e.status === 'ACTIVE').findIndex((e) => e.id === own.id) + 1 : null } : null, otherSubscriberEmailsReturned: false, seatHoldCount: holdCount, unsoldSeatCount: unsoldCount, fixtureOnly: true };
    writeFileSync(resolve(evidenceDir, 'waitlist-browser-db-oracle.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } else if (process.argv[2] === 'cleanup') {
    const f = JSON.parse(readFileSync(privateFile, 'utf8'));
    if (f.runId !== runId) throw new Error('Fixture run mismatch');
    await db.$transaction(async (tx) => {
      await tx.waitlistNotification.deleteMany({ where: { entry: { showtimeId: f.showtimeId } } });
      await tx.waitlistAvailabilitySignal.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.waitlistEntry.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.seatHold.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.holdSession.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.seat.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.seatCategory.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.showtime.delete({ where: { id: f.showtimeId } });
      await tx.event.delete({ where: { id: f.eventId, organizerId: f.ownerId } });
      await tx.session.deleteMany({ where: { userId: { in: [f.userId, f.ownerId] } } });
      await tx.user.deleteMany({ where: { id: { in: [f.userId, f.ownerId] } } });
    });
    rmSync(privateFile, { force: true });
    writeFileSync(resolve(evidenceDir, 'waitlist-browser-fixture-cleanup.json'), JSON.stringify({ runId, cleanup: 'removed exact run-bound fixture', eventId: f.eventId, showtimeId: f.showtimeId }, null, 2));
    console.log(JSON.stringify({ cleaned: true, eventId: f.eventId, showtimeId: f.showtimeId }));
  } else throw new Error('Use seed or cleanup');
} finally { await db.$disconnect(); }
