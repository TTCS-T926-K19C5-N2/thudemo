import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? ''))
  throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const privateDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const state = JSON.parse(readFileSync(resolve(privateDir, 'profile.json'), 'utf8'));
const owner = JSON.parse(readFileSync(resolve(privateDir, 'owner.json'), 'utf8'));
if (state.run_id !== runId || owner.run_id !== runId || owner.project !== state.project)
  throw new Error('Isolated profile ownership mismatch');
const env = Object.fromEntries(
  readFileSync(resolve(privateDir, 'compose.env'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
if (!env.AI_REMEDIATION_DB_PASSWORD) throw new Error('Isolated DB password missing');
const connectionString = `postgresql://remediation:${encodeURIComponent(env.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${state.db.port}/codegym_remediation`;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 4 }),
});
const privateFixture = resolve(privateDir, 'cancellation-browser-fixture.json');
const summary = resolve(evidenceDir, 'cancellation-browser-fixture-summary.json');
mkdirSync(evidenceDir, { recursive: true });

async function cleanupFixture() {
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(privateFixture, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (fixture.runId !== runId) throw new Error('Fixture run-id mismatch');
  await db.$transaction(async (tx) => {
    const refunds = await tx.refund.findMany({
      where: { orderId: fixture.orderId },
      select: { id: true },
    });
    if (refunds.length)
      await tx.refundAttempt.deleteMany({
        where: { refundId: { in: refunds.map((item) => item.id) } },
      });
    await tx.refund.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.operationMail.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.ticketMailDelivery.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.ticket.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.orderItem.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.payment.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.order.deleteMany({ where: { id: fixture.orderId } });
    await tx.seat.deleteMany({ where: { showtimeId: fixture.showtimeId } });
    await tx.seatCategory.deleteMany({ where: { showtimeId: fixture.showtimeId } });
    await tx.showtime.deleteMany({ where: { id: fixture.showtimeId } });
    await tx.event.deleteMany({ where: { id: fixture.eventId, organizerId: fixture.ownerId } });
    const userIds = [fixture.ownerId, fixture.buyerId];
    await tx.session.deleteMany({ where: { userId: { in: userIds } } });
    await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
  rmSync(privateFixture, { force: true });
  writeFileSync(
    resolve(evidenceDir, 'cancellation-browser-fixture-cleanup.json'),
    JSON.stringify({ runId, cleaned: true, orderId: fixture.orderId }, null, 2),
  );
  return true;
}

try {
  const mode = process.argv[2];
  if (mode === 'cleanup') {
    const cleaned = await cleanupFixture();
    console.log(JSON.stringify({ cleaned, runId }));
  } else if (mode === 'seed') {
    try {
      readFileSync(privateFixture);
      throw new Error('Fixture already exists; refusing duplicate seed');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const buyerPassword = randomBytes(24).toString('base64url');
    const organizerPassword = randomBytes(24).toString('base64url');
    const [buyerRole, organizerRole] = await Promise.all([
      db.role.upsert({ where: { name: 'BUYER' }, create: { name: 'BUYER' }, update: {} }),
      db.role.upsert({ where: { name: 'ORGANIZER' }, create: { name: 'ORGANIZER' }, update: {} }),
    ]);
    const [buyer, owner] = await Promise.all([
      db.user.create({
        data: {
          email: `s45-buyer-${runId}@example.invalid`,
          password: await argon2.hash(buyerPassword),
          isEmailVerified: true,
          userRoles: { create: { roleId: buyerRole.id } },
        },
      }),
      db.user.create({
        data: {
          email: `s45-owner-${runId}@example.invalid`,
          password: await argon2.hash(organizerPassword),
          isEmailVerified: true,
          userRoles: { create: { roleId: organizerRole.id } },
        },
      }),
    ]);
    const event = await db.event.create({
      data: {
        name: `S45 browser fixture ${runId}`,
        description: 'Synthetic run-bound cancellation browser fixture',
        location: 'Local test venue',
        organizerId: owner.id,
        status: 'PUBLISHED',
      },
    });
    const show = await db.showtime.create({
      data: {
        eventId: event.id,
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
        status: 'ON_SALE',
      },
    });
    const category = await db.seatCategory.create({
      data: { showtimeId: show.id, name: 'Standard', price: 125_000 },
    });
    const seats = await db.seat.createManyAndReturn({
      data: [1, 2].map((seatNumber) => ({
        showtimeId: show.id,
        categoryId: category.id,
        row: 'C',
        seatNumber,
        isSold: true,
      })),
    });
    const order = await db.order.create({
      data: {
        userId: buyer.id,
        eventId: event.id,
        showtimeId: show.id,
        status: 'PAID',
        totalAmount: 250_000,
        paymentExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        items: {
          create: seats.map((seat) => ({
            seatId: seat.id,
            categoryName: 'Standard',
            unitPrice: 125_000,
          })),
        },
      },
      include: { items: true },
    });
    await db.ticket.createMany({
      data: order.items.map((item, index) => ({
        orderId: order.id,
        showtimeId: show.id,
        seatId: item.seatId,
        code: `S45-${runId}-${index + 1}`,
        seatLabel: `C-${index + 1}`,
        ticketType: 'Standard',
        price: 125_000,
      })),
    });
    await db.payment.create({
      data: {
        orderId: order.id,
        amount: 250_000,
        status: 'SUCCEEDED',
        gateway: 'mock',
        gatewayRef: `s45-browser-${randomUUID()}`,
      },
    });
    const fixture = {
      runId,
      eventId: event.id,
      showtimeId: show.id,
      orderId: order.id,
      buyerId: buyer.id,
      ownerId: owner.id,
      buyerEmail: `s45-buyer-${runId}@example.invalid`,
      buyerPassword,
    };
    writeFileSync(privateFixture, JSON.stringify(fixture, null, 2), {
      mode: 0o600,
      flag: 'wx',
    });
    writeFileSync(
      summary,
      JSON.stringify(
        {
          runId,
          eventId: event.id,
          showtimeId: show.id,
          orderId: order.id,
          seatCount: seats.length,
          orderTotalVnd: 250_000,
          paymentGateway: 'mock',
          synthetic: true,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ seeded: true, runId, orderId: order.id }));
  } else {
    throw new Error('Use seed or cleanup');
  }
} finally {
  await db.$disconnect();
}
