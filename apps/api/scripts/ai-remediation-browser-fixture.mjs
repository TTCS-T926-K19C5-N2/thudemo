import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
const ownerMarker = JSON.parse(readFileSync(resolve(privateDir, 'owner.json'), 'utf8'));
if (state.run_id !== runId || ownerMarker.run_id !== runId || ownerMarker.project !== state.project)
  throw new Error('Run-bound profile ownership check failed');
const privateEnv = Object.fromEntries(readFileSync(resolve(privateDir, 'compose.env'), 'utf8').trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
if (!privateEnv.AI_REMEDIATION_DB_PASSWORD) throw new Error('Isolated DB password missing');
const url = `postgresql://remediation:${encodeURIComponent(privateEnv.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${state.db.port}/codegym_remediation`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4 }) });
const privateFixture = resolve(privateDir, 'browser-fixture.json');
const publicFixture = resolve(evidenceDir, 'browser-fixture-summary.json');
mkdirSync(evidenceDir, { recursive: true });

try {
  const mode = process.argv[2];
  if (mode === 'seed') {
    try { readFileSync(privateFixture); throw new Error('Fixture already exists; refusing duplicate seed'); }
    catch (e) { if (e?.code !== 'ENOENT') throw e; }
    const roleIds = {};
    for (const roleName of ['ORGANIZER', 'ADMIN', 'BUYER', 'STAFF'])
      roleIds[roleName] = (await db.role.upsert({ where: { name: roleName }, create: { name: roleName }, update: {} })).id;
    const ownerPassword = randomBytes(24).toString('base64url');
    const adminPassword = randomBytes(24).toString('base64url');
    const buyerPassword = randomBytes(24).toString('base64url');
    const [owner, admin] = await Promise.all([
      db.user.create({ data: { email: `owner-${runId}@example.invalid`, password: await argon2.hash(ownerPassword), isEmailVerified: true, userRoles: { create: { roleId: roleIds.ORGANIZER } } } }),
      db.user.create({ data: { email: `admin-${runId}@example.invalid`, password: await argon2.hash(adminPassword), isEmailVerified: true, userRoles: { create: { roleId: roleIds.ADMIN } } } }),
    ]);
    const [buyer, staff] = await Promise.all([
      db.user.create({ data: { email: `buyer-${runId}@example.invalid`, password: await argon2.hash(buyerPassword), isEmailVerified: true, userRoles: { create: { roleId: roleIds.BUYER } } } }),
      db.user.create({ data: { email: `staff-${runId}@example.invalid`, password: await argon2.hash(randomBytes(24).toString('base64url')), isEmailVerified: true, userRoles: { create: { roleId: roleIds.STAFF } } } }),
    ]);
    const event = await db.event.create({ data: { name: `AI remediation fixture ${runId}`, description: 'Synthetic run-bound browser fixture', location: 'Local test venue', organizerId: owner.id, status: 'DRAFT' } });
    const showtime = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 5 * 86400000), status: 'ON_SALE', maxTicketsPerUser: null } });
    const rescheduleShowtime = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 6 * 86400000), status: 'ON_SALE', maxTicketsPerUser: null } });
    const category = await db.seatCategory.create({ data: { showtimeId: showtime.id, name: 'QA fixture', price: 1000 } });
    const seats = await db.seat.createManyAndReturn({ data: [1, 2].map((seatNumber) => ({ showtimeId: showtime.id, categoryId: category.id, row: 'QA', seatNumber, isSold: true })) });
    const availableSeat = await db.seat.create({ data: { showtimeId: showtime.id, categoryId: category.id, row: 'QA', seatNumber: 3, isSold: false } });
    const pendingSeat = await db.seat.create({ data: { showtimeId: showtime.id, categoryId: category.id, row: 'QA', seatNumber: 4, isSold: false } });
    const order = await db.order.create({ data: { userId: buyer.id, eventId: event.id, showtimeId: showtime.id, status: 'PAID', paymentExpiresAt: new Date(Date.now() + 86400000), totalAmount: 2000, items: { create: seats.map((seat) => ({ seatId: seat.id, categoryName: 'QA fixture', unitPrice: 1000 })) } }, include: { items: true } });
    await db.payment.create({ data: { orderId: order.id, amount: order.totalAmount, status: 'SUCCEEDED', gateway: 'mock', gatewayRef: `ai-remediation-${runId}-${randomUUID()}` } });
    const pendingOrder = await db.order.create({ data: { userId: buyer.id, eventId: event.id, showtimeId: showtime.id, status: 'PENDING', paymentExpiresAt: new Date(Date.now() + 86400000), expiresAt: new Date(Date.now() + 86400000), totalAmount: 1000, items: { create: { seatId: pendingSeat.id, categoryName: 'QA fixture', unitPrice: 1000 } } } });
    await db.ticket.createMany({ data: seats.map((seat, i) => ({ orderId: order.id, showtimeId: showtime.id, seatId: seat.id, code: `AI-${runId}-${i + 1}`, seatLabel: `QA-${i + 1}`, ticketType: 'QA fixture' })) });
    const tickets = await db.ticket.findMany({ where: { orderId: order.id }, orderBy: { code: 'asc' } });
    const [gateA, gateB] = await Promise.all([
      db.checkInGate.create({ data: { showtimeId: showtime.id, name: 'Cửa Đông' } }),
      db.checkInGate.create({ data: { showtimeId: showtime.id, name: 'Cửa Tây' } }),
    ]);
    await db.ticketAdmission.create({ data: { ticketId: order.items[0].id, showtimeId: showtime.id, gateId: gateA.id, gateName: gateA.name, staffId: staff.id, staffName: 'QA Staff', requestId: randomUUID(), kind: 'NORMAL' } });
    const scanTime = new Date();
    await db.offlineScanLog.createMany({ data: tickets.map((ticket, i) => ({ scanId: randomUUID(), ticketCode: ticket.code, showtimeId: showtime.id, gateId: gateB.id, staffId: staff.id, deviceId: `qa-device-${i + 1}`, scannedAt: new Date(scanTime.getTime() + i * 1000), status: 'CONFLICT', mode: 'offline_admission' })) });
    const fixture = { runId, ownerId: owner.id, adminId: admin.id, buyerId: buyer.id, staffId: staff.id, eventId: event.id, showtimeId: showtime.id, rescheduleShowtimeId: rescheduleShowtime.id, orderId: order.id, pendingOrderId: pendingOrder.id, availableSeatId: availableSeat.id, pendingSeatId: pendingSeat.id, ownerEmail: `owner-${runId}@example.invalid`, ownerPassword, adminEmail: `admin-${runId}@example.invalid`, adminPassword, buyerEmail: `buyer-${runId}@example.invalid`, buyerPassword };
    writeFileSync(privateFixture, JSON.stringify(fixture, null, 2), { mode: 0o600, flag: 'wx' });
    writeFileSync(publicFixture, JSON.stringify({ runId, fixtureEventId: event.id, fixtureShowtimeId: showtime.id, ownerUserId: owner.id, adminUserId: admin.id, ticketCount: tickets.length, admissionCount: 1, conflictScanCount: tickets.length, synthetic: true }, null, 2));
    console.log(JSON.stringify({ seeded: true, eventId: event.id, showtimeId: showtime.id }));
  } else if (mode === 'verify-int09') {
    const f = JSON.parse(readFileSync(privateFixture, 'utf8'));
    if (f.runId !== runId) throw new Error('Fixture run-id mismatch');
    const browser = JSON.parse(readFileSync(resolve(evidenceDir, 'int09-show-cancel-browser.json'), 'utf8'));
    const [show, job, pending, paid, refunds, outbox, seat] = await Promise.all([
      db.showtime.findUniqueOrThrow({ where: { id: f.showtimeId }, select: { status: true, eventId: true } }),
      db.showtimeCancellation.findUnique({ where: { showtimeId: f.showtimeId } }),
      db.order.findUniqueOrThrow({ where: { id: f.pendingOrderId }, select: { status: true } }),
      db.order.findUniqueOrThrow({ where: { id: f.orderId }, select: { status: true } }),
      db.refund.count({ where: { orderId: f.orderId } }),
      db.operationMail.count({ where: { orderId: f.orderId } }),
      db.seat.findUniqueOrThrow({ where: { id: f.availableSeatId }, select: { isSold: true } }),
    ]);
    if (show.status !== 'CLOSED' || show.eventId !== f.eventId || job?.status !== 'QUEUED' || pending.status !== 'CANCELLED' || paid.status !== 'PAID' || refunds !== 0 || outbox !== 0 || seat.isSold || browser.saleFreeze?.jobStatus !== 'QUEUED' || browser.saleFreeze?.holdStatus !== 409 || browser.saleFreeze?.holdCode !== 'SHOWTIME_CLOSED' || browser.errors?.length)
      throw new Error('INT-09 organizer UI and isolated PostgreSQL freeze oracle differ.');
    const oracle = { runId, fixture: { showtimeId: f.showtimeId, paidOrderId: f.orderId, pendingOrderId: f.pendingOrderId, availableSeatId: f.availableSeatId }, showtimeStatus: show.status, cancellationJobStatus: job.status, pendingOrderStatus: pending.status, paidOrderBeforeWorker: paid.status, refundRowsBeforeWorker: refunds, operationMailOutboxRows: outbox, availableSeatStillUnsold: !seat.isSold, buyerHold: { status: browser.saleFreeze.holdStatus, code: browser.saleFreeze.holdCode }, worker: 'explicitly off; this verifies immediate sale closure only, not batch completion/restart' };
    writeFileSync(resolve(evidenceDir, 'int09-postgres-oracle.json'), JSON.stringify(oracle, null, 2));
    console.log('Verified INT-09 immediate sale closure, pending-order cancellation, queued job and catcher-safe outbox against PostgreSQL.');
  } else if (mode === 'cleanup') {
    const f = JSON.parse(readFileSync(privateFixture, 'utf8'));
    if (f.runId !== runId) throw new Error('Fixture run-id mismatch');
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM notification_mail WHERE "showtimeId"=${f.showtimeId}::uuid`;
      await tx.$executeRaw`DELETE FROM schedule_changes WHERE "showtimeId"=${f.showtimeId}::uuid`;
      if (f.rescheduleShowtimeId) {
        await tx.$executeRaw`DELETE FROM notification_mail WHERE "showtimeId"=${f.rescheduleShowtimeId}::uuid`;
        await tx.$executeRaw`DELETE FROM schedule_changes WHERE "showtimeId"=${f.rescheduleShowtimeId}::uuid`;
      }
      if (f.staffId) {
        await tx.$executeRaw`DELETE FROM offline_scan_logs WHERE "showtimeId"=${f.showtimeId}::uuid`;
        await tx.$executeRaw`DELETE FROM ticket_admissions WHERE "showtimeId"=${f.showtimeId}::uuid`;
        await tx.$executeRaw`DELETE FROM check_in_permissions WHERE "userId"=${f.staffId}::uuid`;
      }
      await tx.$executeRaw`DELETE FROM check_in_gates WHERE "showtimeId"=${f.showtimeId}::uuid`;
      await tx.showtimeCancellation.deleteMany({ where: { showtimeId: f.showtimeId } });
      const fixtureOrders = await tx.order.findMany({ where: { showtimeId: f.showtimeId }, select: { id: true } });
      const fixtureOrderIds = fixtureOrders.map((row) => row.id);
      if (fixtureOrderIds.length) {
        const refunds = await tx.refund.findMany({ where: { orderId: { in: fixtureOrderIds } }, select: { id: true } });
        if (refunds.length) await tx.refundAttempt.deleteMany({ where: { refundId: { in: refunds.map((row) => row.id) } } });
        await tx.refund.deleteMany({ where: { orderId: { in: fixtureOrderIds } } });
        await tx.operationMail.deleteMany({ where: { orderId: { in: fixtureOrderIds } } });
        await tx.payment.deleteMany({ where: { orderId: { in: fixtureOrderIds } } });
        await tx.$executeRaw`DELETE FROM tickets WHERE "showtimeId"=${f.showtimeId}::uuid`;
        await tx.orderItem.deleteMany({ where: { order: { showtimeId: f.showtimeId } } });
        await tx.order.deleteMany({ where: { id: { in: fixtureOrderIds } } });
      }
      await tx.couponRedemption.deleteMany({ where: { coupon: { eventId: f.eventId } } });
      await tx.coupon.deleteMany({ where: { eventId: f.eventId } });
      await tx.seatHold.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.holdSession.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.seat.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.seatCategory.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.showtime.deleteMany({ where: { id: f.showtimeId } });
      if (f.rescheduleShowtimeId)
        await tx.showtime.deleteMany({ where: { id: f.rescheduleShowtimeId } });
      await tx.event.deleteMany({ where: { id: f.eventId, organizerId: f.ownerId } });
      await tx.catalogRevision.update({ where: { id: 1 }, data: { version: { increment: 1 } } });
      const userIds = [f.ownerId, f.adminId, f.buyerId, f.staffId].filter(Boolean);
      await tx.session.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
    rmSync(privateFixture, { force: true });
    writeFileSync(resolve(evidenceDir, 'browser-fixture-cleanup.json'), JSON.stringify({ runId, removedFixtureEventId: f.eventId, removedFixtureShowtimeId: f.showtimeId, removedUsers: 2 }, null, 2));
    console.log(JSON.stringify({ cleaned: true, fixtureEventId: f.eventId, fixtureShowtimeId: f.showtimeId }));
  } else {
    throw new Error('Use seed or cleanup');
  }
} finally {
  await db.$disconnect();
}
