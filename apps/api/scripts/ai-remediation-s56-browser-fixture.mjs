import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashSessionToken } from '../dist/auth/auth.service.js';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Set the validated remediation run id.');
const root = resolve(import.meta.dirname, '../../..');
const stateDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const profile = JSON.parse(readFileSync(resolve(stateDir, 'profile.json'), 'utf8'));
const marker = JSON.parse(readFileSync(resolve(stateDir, 'owner.json'), 'utf8'));
if (profile.run_id !== runId || marker.run_id !== runId || marker.project !== profile.project) throw new Error('Run-bound profile ownership check failed.');
const env = Object.fromEntries(readFileSync(resolve(stateDir, 'compose.env'), 'utf8').trim().split(/\r?\n/).map(line => line.split(/=(.*)/s).slice(0, 2)));
const url = `postgresql://remediation:${encodeURIComponent(env.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${profile.db.port}/codegym_remediation`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const privatePath = resolve(stateDir, 's56-browser-fixture.json');
const publicPath = resolve(evidenceDir, 's56-browser-fixture-summary.json');
mkdirSync(evidenceDir, { recursive: true });
const mode = process.argv[2];

try {
  if (mode === 'seed') {
    if (existsSync(privatePath)) throw new Error('S-56 fixture already exists; refusing duplicate seed.');
    const [buyerRole, organizerRole] = await Promise.all([
      db.role.upsert({ where: { name: 'BUYER' }, create: { name: 'BUYER' }, update: {} }),
      db.role.upsert({ where: { name: 'ORGANIZER' }, create: { name: 'ORGANIZER' }, update: {} }),
    ]);
    const buyer = await db.user.create({ data: {
      email: `${runId}.${randomUUID()}@s56-fixture.invalid`,
      password: randomBytes(32).toString('base64url'),
      isEmailVerified: true,
      isActive: true,
      userRoles: { create: { roleId: buyerRole.id } },
    } });
    const owner = await db.user.create({ data: { email: `${runId}.${randomUUID()}@s56-owner.invalid`, password: randomBytes(32).toString('base64url'), isEmailVerified: true, isActive: true, userRoles: { create: { roleId: organizerRole.id } } } });
    const otherOwner = await db.user.create({ data: { email: `${runId}.${randomUUID()}@s56-other-owner.invalid`, password: randomBytes(32).toString('base64url'), isEmailVerified: true, isActive: true, userRoles: { create: { roleId: organizerRole.id } } } });
    const makeSession = async userId => {
      const token = randomBytes(32).toString('base64url');
      await db.session.create({ data: { tokenHash: hashSessionToken(token), userId, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) } });
      return token;
    };
    const [token, ownerToken, otherOwnerToken] = await Promise.all([makeSession(buyer.id), makeSession(owner.id), makeSession(otherOwner.id)]);
    const event = await db.event.create({ data: { name: `S56 fixture ${runId}`, description: 'Synthetic buyer coupon browser fixture', location: 'Loopback test only', status: 'PUBLISHED', organizerId: owner.id } });
    const showtime = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 86_400_000), status: 'ON_SALE' } });
    const category = await db.seatCategory.create({ data: { showtimeId: showtime.id, name: 'S56 QA', price: 101 } });
    const seat = await db.seat.create({ data: { showtimeId: showtime.id, categoryId: category.id, row: 'QA', seatNumber: 1 } });
    const holdToken = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const hold = await db.holdSession.create({ data: { showtimeId: showtime.id, userId: buyer.id, sessionHash: randomUUID(), token: holdToken, expectedSeatIds: [seat.id], expiresAt } });
    await db.seatHold.create({ data: { seatId: seat.id, showtimeId: showtime.id, holdSessionId: hold.id, token: holdToken, expiresAt } });
    const order = await db.order.create({ data: { userId: buyer.id, eventId: event.id, showtimeId: showtime.id, holdSessionId: hold.id, holdToken, status: 'PENDING_PAYMENT', paymentExpiresAt: expiresAt, expiresAt, totalAmount: 101, subtotalAmount: 101, discountAmount: 0, items: { create: { seatId: seat.id, categoryName: 'S56 QA', unitPrice: 101 } } } });
    const coupon = await db.coupon.create({ data: { eventId: event.id, code: 'S56FLOOR10', type: 'PERCENT', value: 10, maxUses: 5, startsAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 86_400_000), isActive: true } });
    const futureCoupon = await db.coupon.create({ data: { eventId: event.id, code: 'S56FUTURE', type: 'FIXED', value: 5, maxUses: 5, startsAt: new Date(Date.now() + 3_600_000), expiresAt: new Date(Date.now() + 7_200_000), isActive: true } });
    const expiredCoupon = await db.coupon.create({ data: { eventId: event.id, code: 'S56EXPIRED', type: 'FIXED', value: 5, maxUses: 5, startsAt: new Date(Date.now() - 7_200_000), expiresAt: new Date(Date.now() - 3_600_000), isActive: true } });
    const fixture = { runId, buyerId: buyer.id, ownerId: owner.id, otherOwnerId: otherOwner.id, eventId: event.id, showtimeId: showtime.id, seatId: seat.id, holdId: hold.id, orderId: order.id, couponId: coupon.id, futureCouponId: futureCoupon.id, expiredCouponId: expiredCoupon.id, token, ownerToken, otherOwnerToken };
    writeFileSync(privatePath, JSON.stringify(fixture, null, 2), { mode: 0o600, flag: 'wx' });
    writeFileSync(publicPath, JSON.stringify({ runId, synthetic: true, subtotal: 101, coupon: 'S56FLOOR10', rule: '10 percent floor', eventId: event.id, showtimeId: showtime.id, orderId: order.id }, null, 2));
    console.log('S-56 run-bound buyer/order/coupon fixture seeded.');
  } else if (mode === 'verify') {
    const f = JSON.parse(readFileSync(privatePath, 'utf8'));
    if (f.runId !== runId) throw new Error('Fixture run id mismatch.');
    const order = await db.order.findUnique({ where: { id: f.orderId }, include: { couponRedemption: true } });
    const coupon = await db.coupon.findUnique({ where: { id: f.couponId } });
    const valid = order?.userId === f.buyerId && order.status === 'PENDING_PAYMENT' && order.subtotalAmount === 101 && order.discountAmount === 0 && order.totalAmount === 101 && order.couponId === null && order.couponRedemption?.status === 'RELEASED' && coupon?.code === 'S56FLOOR10';
    if (!valid) throw new Error('Independent PostgreSQL oracle failed for apply-then-remove final state.');
    const result = { runId, verified: true, subtotalAmount: order.subtotalAmount, discountAmount: order.discountAmount, totalAmount: order.totalAmount, couponId: order.couponId, redemptionStatus: order.couponRedemption.status, paymentCount: await db.payment.count({ where: { orderId: f.orderId } }) };
    if (result.paymentCount !== 0) throw new Error('Unexpected payment row in coupon-only fixture.');
    writeFileSync(resolve(evidenceDir, 's56-browser-db-oracle.json'), JSON.stringify(result, null, 2));
    console.log('Independent PostgreSQL oracle verified applied coupon was released and original amount restored.');
  } else if (mode === 'cleanup') {
    const f = JSON.parse(readFileSync(privatePath, 'utf8'));
    if (f.runId !== runId) throw new Error('Fixture run id mismatch.');
    await db.$transaction(async tx => {
      await tx.couponRedemption.deleteMany({ where: { orderId: f.orderId } });
      await tx.payment.deleteMany({ where: { orderId: f.orderId } });
      await tx.orderItem.deleteMany({ where: { orderId: f.orderId } });
      await tx.order.deleteMany({ where: { id: f.orderId } });
      await tx.coupon.deleteMany({ where: { eventId: f.eventId } });
      await tx.seatHold.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.holdSession.deleteMany({ where: { id: f.holdId, showtimeId: f.showtimeId } });
      await tx.seat.deleteMany({ where: { id: f.seatId, showtimeId: f.showtimeId } });
      await tx.seatCategory.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.showtime.deleteMany({ where: { id: f.showtimeId, eventId: f.eventId } });
      await tx.event.deleteMany({ where: { id: f.eventId, organizerId: f.ownerId } });
      const userIds = [f.buyerId, f.ownerId, f.otherOwnerId];
      await tx.session.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
    rmSync(privatePath, { force: true });
    writeFileSync(resolve(evidenceDir, 's56-browser-fixture-cleanup.json'), JSON.stringify({ runId, cleaned: true, eventId: f.eventId, showtimeId: f.showtimeId, orderId: f.orderId, userId: f.buyerId }, null, 2));
    console.log('S-56 run-bound fixture cleaned.');
  } else {
    throw new Error('Use seed, verify, or cleanup.');
  }
} finally {
  await db.$disconnect();
}
