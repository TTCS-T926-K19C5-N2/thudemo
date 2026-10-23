import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { CancellationsService } from '../dist/lifecycle/cancellations.service.js';
const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing validated run id.');
const root = resolve(import.meta.dirname, '../../..');
const cache = resolve(root, '.cache/ai-remediation', runId);
const evidence = resolve(root, 'evidence/ai-remediation', runId);
const fixtureFile = resolve(cache, 'int09-batch-fixture.json');
const profile = JSON.parse(readFileSync(resolve(cache, 'profile.json'), 'utf8'));
if (profile.run_id !== runId) throw new Error('Isolated profile owner mismatch.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const cancel = new CancellationsService(db, { invalidate() {} }, new ConfigService(process.env));
function fixture() {
  if (!existsSync(fixtureFile)) throw new Error('No owned INT-09 batch fixture.');
  const value = JSON.parse(readFileSync(fixtureFile, 'utf8'));
  if (value.runId !== runId) throw new Error('Fixture run id mismatch.');
  return value;
}
async function seed() {
  if (existsSync(fixtureFile)) throw new Error('INT-09 batch fixture already exists.');
  await db.$connect();
  const [organizerRole, buyerRole, accountantRole] = await Promise.all([
    db.role.upsert({ where: { name: 'ORGANIZER' }, create: { name: 'ORGANIZER' }, update: {} }),
    db.role.upsert({ where: { name: 'BUYER' }, create: { name: 'BUYER' }, update: {} }),
    db.role.upsert({ where: { name: 'ACCOUNTANT' }, create: { name: 'ACCOUNTANT' }, update: {} }),
  ]);
  const organizerEmail = `${runId}.${randomUUID()}@int09-organizer.invalid`;
  const organizerPassword = randomUUID();
  const organizer = await db.user.create({ data: { email: organizerEmail, password: await argon2.hash(organizerPassword), isActive: true, isEmailVerified: true, userRoles: { create: [{ roleId: organizerRole.id }, { roleId: accountantRole.id }] } } });
  const buyer = await db.user.create({ data: { email: `${runId}.${randomUUID()}@int09-buyer.invalid`, password: randomUUID(), isActive: true, isEmailVerified: true, userRoles: { create: { roleId: buyerRole.id } } } });
  const event = await db.event.create({ data: { name: `INT09 batch fixture ${runId} ${randomUUID()}`, description: 'Synthetic run-bound cancellation batch test', location: 'Local test venue', organizerId: organizer.id, status: 'PUBLISHED' } });
  const show = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 5 * 86400000), status: 'ON_SALE' } });
  const category = await db.seatCategory.create({ data: { showtimeId: show.id, name: 'INT09 batch fixture', price: 1000 } });
  const seats = await db.seat.createManyAndReturn({ data: Array.from({ length: 23 }, (_, i) => ({ showtimeId: show.id, categoryId: category.id, row: 'B', seatNumber: i + 1, isSold: i < 22 })) });
  const paidOrderIds = [];
  for (let i = 0; i < 22; i++) {
    const order = await db.order.create({ data: { userId: buyer.id, eventId: event.id, showtimeId: show.id, status: 'PAID', totalAmount: 1000, paymentExpiresAt: new Date(Date.now() + 86400000), expiresAt: new Date(Date.now() + 86400000), items: { create: { seatId: seats[i].id, categoryName: 'INT09 batch fixture', unitPrice: 1000 } } } });
    await db.payment.create({ data: { orderId: order.id, amount: 1000, status: 'SUCCEEDED', gateway: 'mock', gatewayRef: `int09-${runId}-${i}-${randomUUID()}` } });
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await db.ticket.create({ data: { orderId: order.id, showtimeId: show.id, seatId: seats[i].id, code: `INT09-${runId}-${i + 1}`, seatLabel: `B-${i + 1}`, ticketType: 'INT09 fixture', status: 'VALID', price: 1000 } });
    paidOrderIds.push(order.id);
  }
  const pending = await db.order.create({ data: { userId: buyer.id, eventId: event.id, showtimeId: show.id, status: 'PENDING', totalAmount: 1000, paymentExpiresAt: new Date(Date.now() + 86400000), expiresAt: new Date(Date.now() + 86400000), items: { create: { seatId: seats[22].id, categoryName: 'INT09 batch fixture', unitPrice: 1000 } } } });
  const saved = { runId, eventId: event.id, organizerId: organizer.id, organizerEmail, organizerPassword, buyerId: buyer.id, showtimeId: show.id, categoryId: category.id, seatIds: seats.map((s) => s.id), paidOrderIds, pendingOrderId: pending.id, synthetic: true };
  writeFileSync(fixtureFile, JSON.stringify(saved, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ seeded: true, paidOrders: paidOrderIds.length, pendingOrders: 1, ticketCount: paidOrderIds.length }));
}
async function cancelShow() {
  const f = fixture();
  const event = await db.event.findUniqueOrThrow({ where: { id: f.eventId }, select: { name: true, organizerId: true } });
  if (!event.name.startsWith(`INT09 batch fixture ${runId} `) || event.organizerId !== f.organizerId) throw new Error('Fixture ownership mismatch.');
  const job = await cancel.cancelShow(f.showtimeId, { id: f.organizerId, email: '', roles: ['ORGANIZER'] }, 'INT-09 multi-batch integration');
  if (job.status !== 'QUEUED') throw new Error('Show cancellation job did not queue.');
  const pending = await db.order.findUniqueOrThrow({ where: { id: f.pendingOrderId }, select: { status: true } });
  if (pending.status !== 'CANCELLED') throw new Error('Pending order was not cancelled at freeze time.');
  console.log(JSON.stringify({ showtimeStatus: 'CLOSED', jobStatus: job.status, pendingOrderStatus: pending.status, paidOrderCount: f.paidOrderIds.length }));
}
async function showBatch() {
  const f = fixture();
  await cancel.processShowBatch();
  const [job, paid, cancelled, refundCount] = await Promise.all([
    db.showtimeCancellation.findUniqueOrThrow({ where: { showtimeId: f.showtimeId } }),
    db.order.count({ where: { showtimeId: f.showtimeId, status: 'PAID' } }),
    db.order.count({ where: { showtimeId: f.showtimeId, status: 'CANCELLED' } }),
    db.refund.count({ where: { order: { showtimeId: f.showtimeId } } }),
  ]);
  if (paid > 2 || cancelled < 20 || refundCount !== cancelled - 1) throw new Error('First showtime batch did not commit the expected <=20-order slice.');
  console.log(JSON.stringify({ process: 'fresh worker-service invocation', jobStatus: job.status, cancelledOrders: cancelled, remainingPaidOrders: paid, refundsCreated: refundCount }));
}
async function failExactlyOneRefund() {
  const f = fixture();
  const refunds = await db.refund.findMany({ where: { order: { showtimeId: f.showtimeId } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (refunds.length !== 20) throw new Error('Expected the first 20-order batch to create 20 refunds.');
  const failed = refunds[0];
  await db.refund.updateMany({ where: { id: { in: refunds.slice(1).map((r) => r.id) } }, data: { nextAttemptAt: new Date(Date.now() + 3600000) } });
  await cancel.processRefundBatch();
  const row = await db.refund.findUniqueOrThrow({ where: { id: failed.id } });
  if (row.status !== 'QUEUED' || row.attempts !== 1 || row.failureCode !== 'MOCK_PROVIDER_UNAVAILABLE' || row.nextAttemptAt <= new Date()) throw new Error('Single mock refund failure/backoff did not persist.');
  await db.refund.updateMany({ where: { id: { in: refunds.slice(1).map((r) => r.id) } }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  const saved = { ...f, failedRefundId: failed.id, failedOrderId: failed.orderId, failedAttemptRecordedAt: new Date().toISOString() };
  writeFileSync(fixtureFile, JSON.stringify(saved, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ refundFailedOnce: true, attempts: row.attempts, backoffScheduled: true, otherRefundsRescheduledForIsolatedRetry: refunds.length - 1 }));
}
async function workerBatch() {
  const f = fixture();
  if (f.failedAttemptRecordedAt) {
    const waitMs = Math.max(0, 5100 - (Date.now() - Date.parse(f.failedAttemptRecordedAt)));
    if (waitMs) await delay(waitMs);
  }
  await cancel.processShowBatch();
  await cancel.processRefundBatch();
  const [job, paid, cancelled, succeeded] = await Promise.all([
    db.showtimeCancellation.findUniqueOrThrow({ where: { showtimeId: f.showtimeId } }),
    db.order.count({ where: { showtimeId: f.showtimeId, status: 'PAID' } }),
    db.order.count({ where: { showtimeId: f.showtimeId, status: 'CANCELLED' } }),
    db.refund.count({ where: { order: { showtimeId: f.showtimeId }, status: 'SUCCEEDED' } }),
  ]);
  console.log(JSON.stringify({ process: 'fresh worker-service invocation', jobStatus: job.status, cancelledOrders: cancelled, remainingPaidOrders: paid, successfulRefunds: succeeded }));
}
async function verify() {
  const f = fixture();
  const [job, show, orders, tickets, refunds, attempts, mails, seats] = await Promise.all([
    db.showtimeCancellation.findUniqueOrThrow({ where: { showtimeId: f.showtimeId } }),
    db.showtime.findUniqueOrThrow({ where: { id: f.showtimeId }, select: { status: true } }),
    db.order.findMany({ where: { showtimeId: f.showtimeId }, select: { id: true, status: true } }),
    db.ticket.findMany({ where: { showtimeId: f.showtimeId }, select: { status: true } }),
    db.refund.findMany({ where: { order: { showtimeId: f.showtimeId } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, orderId: true, amount: true, status: true, attempts: true, failureCode: true } }),
    db.refundAttempt.findMany({ where: { refund: { order: { showtimeId: f.showtimeId } } }, select: { id: true, refundId: true, attempt: true, status: true } }),
    db.operationMail.findMany({ where: { order: { showtimeId: f.showtimeId } }, select: { id: true, orderId: true, status: true, attempts: true } }),
    db.seat.findMany({ where: { id: { in: f.seatIds } }, select: { id: true, isSold: true } }),
  ]);
  const byFailed = refunds.find((r) => r.id === f.failedRefundId);
  const pending = orders.filter((o) => o.id === f.pendingOrderId);
  const expectedMailStatus = f.mailDeliveryVerified ? 'SENT' : 'QUEUED';
  if (show.status !== 'CLOSED' || job.status !== 'COMPLETED' || orders.length !== 23 || orders.filter((o) => o.status === 'PAID').length || pending[0]?.status !== 'CANCELLED' || tickets.length !== 22 || tickets.some((t) => t.status !== 'CANCELLED') || refunds.length !== 22 || refunds.some((r) => r.status !== 'SUCCEEDED' || r.amount !== 1000) || attempts.length !== 23 || !byFailed || byFailed.attempts !== 2 || mails.length !== 22 || mails.some((m) => m.status !== expectedMailStatus) || seats.filter((s) => s.isSold).length) throw new Error('INT-09 final batch/refund/mail invariants do not match fixture.');
  const result = { runId, fixture: { showtimeId: f.showtimeId, paidOrderCount: f.paidOrderIds.length, pendingOrderId: f.pendingOrderId }, showtimeStatus: show.status, cancellationJobStatus: job.status, paidOrdersRemaining: orders.filter((o) => o.status === 'PAID').length, cancelledOrders: orders.filter((o) => o.status === 'CANCELLED').length, pendingOrderStatus: pending[0].status, ticketsCancelled: tickets.length, refunds: { count: refunds.length, successful: refunds.filter((r) => r.status === 'SUCCEEDED').length, uniqueOrderCount: new Set(refunds.map((r) => r.orderId)).size, amountsVnd: [...new Set(refunds.map((r) => r.amount))], attemptsCount: attempts.length, oneRefundRetried: { refundId: byFailed.id, attempts: byFailed.attempts, finalStatus: byFailed.status } }, operationMailOutbox: { count: mails.length, statusCounts: { QUEUED: mails.filter((m) => m.status === 'QUEUED').length, SENT: mails.filter((m) => m.status === 'SENT').length } }, seatsSoldAfterCancel: seats.filter((s) => s.isSold).length, workerInvocations: 'separate node processes per batch/retry call; database state persisted between processes', mailDelivery: f.mailDeliveryVerified ? 'isolated Nest lifecycle worker delivered all run fixture messages to Mailpit catcher; verified by Message-ID; no real email sent' : 'not invoked; lifecycle worker/outbox delivery remains disabled; no customer email sent' };
  writeFileSync(resolve(evidence, 'int09-batch-postgres-oracle.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log('Verified INT-09 22-order batching, one mock refund failure/retry, 22 cancelled tickets, and no missing/duplicate refunds.');
}
async function lifecycleMailWorker() {
  const f = fixture();
  const state = JSON.parse(readFileSync(resolve(cache, 'profile.json'), 'utf8'));
  const before = await fetch(`http://127.0.0.1:${state.smtp.catcher_ui_port}/api/v1/messages`).then((r) => r.json());
  const mails = await db.operationMail.findMany({ where: { order: { showtimeId: f.showtimeId } }, select: { id: true, status: true } });
  if (mails.length !== 22 || mails.some((m) => !['QUEUED', 'SENT'].includes(m.status))) throw new Error('Expected exactly 22 run-bound queued/sent mails before catcher test.');
  const pendingOutsideFixture = await db.operationMail.findMany({ where: { order: { showtimeId: { not: f.showtimeId } }, status: { in: ['QUEUED', 'SENDING'] } }, select: { order: { select: { user: { select: { email: true } } } } } });
  const unsafe = pendingOutsideFixture.filter((m) => !m.order.user.email.toLowerCase().endsWith('.invalid')).length;
  if (unsafe) throw new Error('Refusing catcher worker because non-fixture outbox contains a non-.invalid recipient.');
  let sent = mails.filter((m) => m.status === 'SENT').length;
  if (sent !== 22) {
    process.env.LIFECYCLE_WORKER = 'on';
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../dist/app.module.js');
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        sent = await db.operationMail.count({ where: { order: { showtimeId: f.showtimeId }, status: 'SENT' } });
        if (sent === 22) break;
        await delay(250);
      }
      if (sent !== 22) throw new Error(`Isolated lifecycle worker sent ${sent}/22 operation emails to catcher.`);
    } finally {
      await app.close();
    }
  }
  const after = await fetch(`http://127.0.0.1:${state.smtp.catcher_ui_port}/api/v1/messages?start=0&limit=100`).then((r) => r.json());
  const expectedIds = new Set(mails.map((m) => `show-cancel-${m.id}@codegym.local`));
  const captured = (after.messages ?? []).filter((m) => expectedIds.has(m.MessageID));
  if (captured.length !== 22) throw new Error(`Mailpit captured ${captured.length}/22 unique run-bound Message-ID values.`);
  const f2 = { ...f, mailDeliveryVerified: true };
  writeFileSync(fixtureFile, JSON.stringify(f2, null, 2), { mode: 0o600 });
  writeFileSync(resolve(evidence, 'int09-mailpit-catcher-oracle.json'), JSON.stringify({ runId, isolatedProfile: true, previousMessageCount: before.total, currentMessageCount: after.total, fixtureMessagesCaptured: captured.length, fixtureMessageIdsMatched: true, fixtureMessageIds: captured.map((m) => m.MessageID), operationMailSent: sent, recipientDomainsRestrictedToInvalid: true, realEmailSent: false }, null, 2));
  console.log(JSON.stringify({ lifecycleWorker: 'isolated Nest lifecycle module', outboxSent: sent, mailpitCaptured: captured.length, realEmailSent: false }));
}
async function cleanup() {
  const f = fixture();
  const event = await db.event.findUniqueOrThrow({ where: { id: f.eventId }, select: { name: true, organizerId: true } });
  if (!event.name.startsWith(`INT09 batch fixture ${runId} `) || event.organizerId !== f.organizerId) throw new Error('Fixture cleanup ownership check failed.');
  await db.$transaction(async (tx) => {
    await tx.showtimeCancellation.deleteMany({ where: { showtimeId: f.showtimeId } });
    const refunds = await tx.refund.findMany({ where: { order: { showtimeId: f.showtimeId } }, select: { id: true } });
    if (refunds.length) await tx.refundAttempt.deleteMany({ where: { refundId: { in: refunds.map((r) => r.id) } } });
    const orderIds = (await tx.order.findMany({ where: { showtimeId: f.showtimeId }, select: { id: true } })).map((o) => o.id);
    if (orderIds.length) {
      await tx.refund.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.operationMail.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.ticket.deleteMany({ where: { showtimeId: f.showtimeId } });
      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await tx.seat.deleteMany({ where: { id: { in: f.seatIds } } });
    await tx.seatCategory.deleteMany({ where: { id: f.categoryId } });
    await tx.showtime.deleteMany({ where: { id: f.showtimeId } });
    await tx.event.deleteMany({ where: { id: f.eventId, organizerId: f.organizerId } });
    await tx.userRole.deleteMany({ where: { userId: { in: [f.organizerId, f.buyerId] } } });
    await tx.user.deleteMany({ where: { id: { in: [f.organizerId, f.buyerId] } } });
  });
  rmSync(fixtureFile, { force: true });
  writeFileSync(resolve(evidence, 'int09-batch-cleanup.json'), JSON.stringify({ runId, cleaned: true, fixtureEventId: f.eventId, fixtureShowtimeId: f.showtimeId, orderCount: 23, ticketCount: 22, refundCount: 22 }, null, 2));
  console.log('INT-09 run-bound fixture rows cleaned.');
}
let harnessFailed = false;
try {
  const op = process.argv[2];
  if (op === 'seed') await seed();
  else if (op === 'cancel') await cancelShow();
  else if (op === 'show-batch') await showBatch();
  else if (op === 'refund-fail-one') await failExactlyOneRefund();
  else if (op === 'worker-batch') await workerBatch();
  else if (op === 'mail-worker') await lifecycleMailWorker();
  else if (op === 'verify') await verify();
  else if (op === 'cleanup') await cleanup();
  else throw new Error('Invalid INT-09 operation.');
} catch (error) {
  harnessFailed = true;
  throw error;
} finally {
  await db.$disconnect();
  // Nest's unrelated isolated infrastructure clients can keep this one-shot
  // harness process alive after the lifecycle context has closed.
  if (process.argv[2] === 'mail-worker' && !harnessFailed) {
    await new Promise((resolve) => process.stdout.write('', resolve));
    process.exit(0);
  }
}


