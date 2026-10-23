import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing validated run id.');
const root = resolve(import.meta.dirname, '../../..');
const cache = resolve(root, '.cache/ai-remediation', runId);
const evidence = resolve(root, 'evidence/ai-remediation', runId);
mkdirSync(evidence, { recursive: true });
const fixtureFile = resolve(cache, 'int16-transfer-fixture.json');
const profile = JSON.parse(readFileSync(resolve(cache, 'profile.json'), 'utf8'));
if (profile.run_id !== runId) throw new Error('Profile ownership mismatch.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const writeEvidence = (name, value) => writeFileSync(resolve(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
function fixture() {
  if (!existsSync(fixtureFile)) throw new Error('No owned INT-16 fixture.');
  const f = JSON.parse(readFileSync(fixtureFile, 'utf8'));
  if (f.runId !== runId || f.synthetic !== true) throw new Error('Fixture ownership mismatch.');
  return f;
}
async function seed() {
  if (existsSync(fixtureFile)) throw new Error('INT-16 fixture already exists.');
  await db.$connect();
  const roles = await Promise.all(['ORGANIZER', 'BUYER'].map((name) => db.role.upsert({ where: { name }, create: { name }, update: {} })));
  const organizerRole = roles[0], buyerRole = roles[1];
  const ownerEmail = `${runId}.${randomUUID()}@int16-owner.invalid`, recipientEmail = `${runId}.${randomUUID()}@int16-recipient.invalid`;
  const ownerPassword = randomUUID(), recipientPassword = randomUUID();
  const [owner, recipient] = await Promise.all([
    db.user.create({ data: { email: ownerEmail, password: await argon2.hash(ownerPassword), isActive: true, isEmailVerified: true, userRoles: { create: { roleId: buyerRole.id } } } }),
    db.user.create({ data: { email: recipientEmail, password: await argon2.hash(recipientPassword), isActive: true, isEmailVerified: true, userRoles: { create: { roleId: buyerRole.id } } } }),
  ]);
  const organizer = await db.user.create({ data: { email: `${runId}.${randomUUID()}@int16-organizer.invalid`, password: randomUUID(), isActive: true, isEmailVerified: true, userRoles: { create: { roleId: organizerRole.id } } } });
  const event = await db.event.create({ data: { name: `INT16 transfer ${runId} ${randomUUID()}`, description: 'Synthetic run-bound transfer fixture', location: 'Local fixture venue', organizerId: organizer.id, status: 'PUBLISHED' } });
  const show = await db.showtime.create({ data: { eventId: event.id, startTime: new Date(Date.now() + 10 * 86400000), status: 'ON_SALE' } });
  const category = await db.seatCategory.create({ data: { showtimeId: show.id, name: 'INT16 fixture', price: 125000 } });
  const seat = await db.seat.create({ data: { showtimeId: show.id, categoryId: category.id, row: 'T', seatNumber: 16, isSold: true } });
  const order = await db.order.create({ data: { userId: owner.id, eventId: event.id, showtimeId: show.id, status: 'PAID', totalAmount: 125000, paymentExpiresAt: new Date(Date.now() + 86400000), expiresAt: new Date(Date.now() + 86400000), items: { create: { seatId: seat.id, categoryName: category.name, unitPrice: 125000 } } } });
  await db.payment.create({ data: { orderId: order.id, amount: 125000, status: 'SUCCEEDED', gateway: 'mock', gatewayRef: `int16-${runId}-${randomUUID()}` } });
  const item = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  const oldCode = `INT16-${runId}-${randomUUID()}`;
  const oldTicket = await db.ticket.create({ data: { orderId: order.id, showtimeId: show.id, seatId: seat.id, code: oldCode, seatLabel: 'T-16', ticketType: category.name, status: 'VALID', price: 125000 } });
  const f = { runId, synthetic: true, eventId: event.id, organizerId: organizer.id, ownerId: owner.id, ownerEmail, ownerPassword, recipientId: recipient.id, recipientEmail, recipientPassword, showtimeId: show.id, categoryId: category.id, seatId: seat.id, orderId: order.id, orderItemId: item.id, oldTicketId: oldTicket.id, oldCode, totalAmount: order.totalAmount };
  writeFileSync(fixtureFile, JSON.stringify(f, null, 2), { flag: 'wx', mode: 0o600 });
  writeEvidence('int16-transfer-seed.json', { runId, fixture: { eventId: event.id, showtimeId: show.id, orderId: order.id, orderItemId: item.id, initialTicketId: oldTicket.id }, amountVnd: 125000, syntheticBuyerAndRecipient: true });
  console.log('INT-16 run-bound ticket transfer fixture seeded.');
}
async function verify() {
  const f = fixture();
  const [tickets, item, order, logs, ownerVisibleCount, recipientVisibleCount, transferMailCount] = await Promise.all([
    db.ticket.findMany({ where: { showtimeId: f.showtimeId, seatId: f.seatId }, orderBy: { createdAt: 'asc' }, select: { id: true, orderId: true, code: true, status: true, ownerEmail: true, transferredToEmail: true, price: true, seatId: true } }),
    db.orderItem.findUniqueOrThrow({ where: { id: f.orderItemId }, select: { unitPrice: true, checkedInAt: true } }),
    db.order.findUniqueOrThrow({ where: { id: f.orderId }, select: { status: true, totalAmount: true, userId: true } }),
    db.ticketLog.findMany({ where: { ticket: { showtimeId: f.showtimeId, seatId: f.seatId } }, select: { action: true, ticketId: true } }),
    db.ticket.count({ where: { orderId: f.orderId, status: 'VALID', OR: [{ ownerEmail: null }, { ownerEmail: { equals: f.ownerEmail, mode: 'insensitive' } }] } }),
    db.ticket.count({ where: { showtimeId: f.showtimeId, seatId: f.seatId, status: 'VALID', ownerEmail: { equals: f.recipientEmail, mode: 'insensitive' } } }),
    db.ticketMailDelivery.count({ where: { orderId: f.orderId, dedupeKey: { startsWith: 'transfer:' } } }),
  ]);
  const oracle = { runId, fixture: { showtimeId: f.showtimeId, orderId: f.orderId, orderItemId: f.orderItemId }, order: { status: order.status, totalAmountVnd: order.totalAmount, originalBuyerStillOwner: order.userId === f.ownerId }, itemUnitPriceVnd: item.unitPrice, tickets, ticketCount: tickets.length, validTicketCount: tickets.filter((t) => t.status === 'VALID').length, recipientOwnedValidTicketCount: recipientVisibleCount, transferMailOutboxRows: transferMailCount, auditActions: logs.map((l) => l.action), ticketCountMatchesPaidItems: tickets.filter((t) => t.orderId === f.orderId).length === 1 && item.unitPrice === order.totalAmount };
  writeEvidence('int16-transfer-postgres-oracle.json', oracle);
  console.log(JSON.stringify({ transferred: tickets.length === 2 && tickets.some((t) => t.status === 'CANCELLED') && tickets.some((t) => t.status === 'VALID'), recipientHasValidTicketInLedger: recipientVisibleCount === 1, totalAmountUnchanged: item.unitPrice === order.totalAmount }));
}
async function cleanup() {
  const f = fixture();
  const event = await db.event.findUniqueOrThrow({ where: { id: f.eventId }, select: { name: true, organizerId: true } });
  if (!event.name.startsWith(`INT16 transfer ${runId} `) || event.organizerId !== f.organizerId) throw new Error('Run-bound cleanup guard failed.');
  await db.$transaction(async (tx) => {
    const ids = (await tx.ticket.findMany({ where: { orderId: f.orderId }, select: { id: true } })).map((x) => x.id);
    if (ids.length) await tx.ticketLog.deleteMany({ where: { ticketId: { in: ids } } });
    await tx.ticketMailDelivery.deleteMany({ where: { orderId: f.orderId } });
    await tx.ticket.deleteMany({ where: { orderId: f.orderId } });
    await tx.payment.deleteMany({ where: { orderId: f.orderId } });
    await tx.orderItem.deleteMany({ where: { orderId: f.orderId } });
    await tx.order.deleteMany({ where: { id: f.orderId } });
    await tx.seat.deleteMany({ where: { id: f.seatId } });
    await tx.seatCategory.deleteMany({ where: { id: f.categoryId } });
    await tx.showtime.deleteMany({ where: { id: f.showtimeId } });
    await tx.event.deleteMany({ where: { id: f.eventId, organizerId: f.organizerId } });
    await tx.userRole.deleteMany({ where: { userId: { in: [f.ownerId, f.recipientId, f.organizerId] } } });
    await tx.user.deleteMany({ where: { id: { in: [f.ownerId, f.recipientId, f.organizerId] } } });
  });
  rmSync(fixtureFile, { force: true });
  writeEvidence('int16-transfer-cleanup.json', { runId, cleaned: true, eventId: f.eventId, orderId: f.orderId, ticketCount: 2 });
  console.log('INT-16 run-bound fixture cleaned.');
}
try {
  const op = process.argv[2];
  if (op === 'seed') await seed(); else if (op === 'verify') await verify(); else if (op === 'cleanup') await cleanup(); else throw new Error('Invalid INT-16 fixture operation.');
} finally { await db.$disconnect(); }
