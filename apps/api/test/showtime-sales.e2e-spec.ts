import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { OrderStatus } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';

describe('Showtime sales S-50 E2E Integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let owner: { id: string; cookie: string };
  let otherOrganizer: { id: string; cookie: string };
  let buyer: { id: string; cookie: string };
  const userIds: string[] = [];
  let eventId: string;
  let showtimeId: string;
  let vip: { id: string };
  let standard: { id: string };

  async function createAccount(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@s50-e2e.test`,
        password: 'secure-test-password',
        isEmailVerified: true,
        userRoles: { create: { roleId: r.id } },
      },
    });
    userIds.push(user.id);
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  async function seat(categoryId: string, row: string, seatNumber: number, isSold = false) {
    return db.seat.create({ data: { showtimeId, categoryId, row, seatNumber, isSold } });
  }

  async function order(status: OrderStatus, items: { seatId: string; unitPrice: number }[]) {
    return db.order.create({
      data: {
        userId: buyer.id,
        showtimeId,
        status,
        paymentExpiresAt: new Date(Date.now() + 600000),
        totalAmount: items.reduce((sum, i) => sum + i.unitPrice, 0),
        items: {
          create: items.map((i) => ({ ...i, categoryName: 'snapshot' })),
        },
      },
    });
  }

  async function hold(seatIds: string[], expiresAt: Date) {
    const session = await db.holdSession.create({
      data: {
        showtimeId,
        userId: buyer.id,
        sessionHash: randomUUID(),
        token: randomUUID(),
        expiresAt,
      },
    });
    await db.seatHold.createMany({
      data: seatIds.map((seatId) => ({
        seatId,
        showtimeId,
        holdSessionId: session.id,
        token: session.token,
        expiresAt,
      })),
    });
  }

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (
      target.hostname !== '127.0.0.1' ||
      target.port !== '15432' ||
      target.pathname !== '/sprint2_integration'
    ) {
      throw new Error('Run only on the isolated sprint2_integration database');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);

    owner = await createAccount('ORGANIZER');
    otherOrganizer = await createAccount('ORGANIZER');
    buyer = await createAccount('BUYER');

    const event = await db.event.create({
      data: {
        name: 'S50 Sales Event',
        description: 'Revenue and inventory per showtime',
        location: 'Hà Nội',
        organizerId: owner.id,
        status: 'PUBLISHED',
      },
    });
    eventId = event.id;
    const showtime = await db.showtime.create({
      data: { eventId, startTime: new Date('2026-12-20T12:00:00Z'), status: 'ON_SALE' },
    });
    showtimeId = showtime.id;
    vip = await db.seatCategory.create({ data: { showtimeId, name: 'VIP', price: 500000 } });
    standard = await db.seatCategory.create({
      data: { showtimeId, name: 'STANDARD', price: 200000 },
    });

    // VIP: 2 sold (one sold before a price change), 1 held, 1 with an expired hold, 1 free.
    const [v1, v2, v3, v4] = await Promise.all([
      seat(vip.id, 'A', 1, true),
      seat(vip.id, 'A', 2, true),
      seat(vip.id, 'A', 3),
      seat(vip.id, 'A', 4),
      seat(vip.id, 'A', 5),
    ]);
    await order(OrderStatus.PAID, [
      { seatId: v1.id, unitPrice: 450000 },
      { seatId: v2.id, unitPrice: 500000 },
    ]);
    await hold([v3.id], new Date(Date.now() + 10 * 60000));
    await hold([v4.id], new Date(Date.now() - 60000));

    // STANDARD: 1 sold, 1 pending payment (held), 2 free; a late payment is not revenue.
    const [s1, s2, s3] = await Promise.all([
      seat(standard.id, 'B', 1, true),
      seat(standard.id, 'B', 2),
      seat(standard.id, 'B', 3),
      seat(standard.id, 'B', 4),
    ]);
    await order(OrderStatus.PAID, [{ seatId: s1.id, unitPrice: 200000 }]);
    await order(OrderStatus.PENDING_PAYMENT, [{ seatId: s2.id, unitPrice: 200000 }]);
    await hold([s2.id], new Date(Date.now() + 10 * 60000));
    await order(OrderStatus.NEEDS_REVIEW, [{ seatId: s3.id, unitPrice: 200000 }]);
  });

  afterAll(async () => {
    if (db && showtimeId) {
      await db.orderItem.deleteMany({ where: { order: { showtimeId } } });
      await db.order.deleteMany({ where: { showtimeId } });
      await db.seatHold.deleteMany({ where: { showtimeId } });
      await db.holdSession.deleteMany({ where: { showtimeId } });
      await db.seat.deleteMany({ where: { showtimeId } });
      await db.seatCategory.deleteMany({ where: { showtimeId } });
      await db.showtime.deleteMany({ where: { id: showtimeId } });
      await db.event.deleteMany({ where: { id: eventId } });
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  it('reports sold, held, available and revenue per category for the owner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/showtimes/${showtimeId}/manage/sales`)
      .set('Cookie', owner.cookie)
      .expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.showtimeId).toBe(showtimeId);
    expect(Date.parse(res.body.generatedAt)).toBeGreaterThan(Date.now() - 60000);
    expect(res.body.categories).toEqual([
      // Revenue uses the price snapshot of PAID orders, not the current price.
      { name: 'STANDARD', price: 200000, totalSeats: 4, sold: 1, held: 1, available: 2, revenue: 200000 },
      // An expired hold that is not cleaned up yet counts as available.
      { name: 'VIP', price: 500000, totalSeats: 5, sold: 2, held: 1, available: 2, revenue: 950000 },
    ]);
    expect(res.body.totals).toEqual({
      totalSeats: 9,
      sold: 3,
      held: 2,
      available: 4,
      revenue: 1150000,
    });
  });

  it('reflects a new sale on the next request', async () => {
    const free = await db.seat.findFirstOrThrow({
      where: { showtimeId, row: 'B', seatNumber: 4 },
    });
    await db.seat.update({ where: { id: free.id }, data: { isSold: true } });
    await order(OrderStatus.PAID, [{ seatId: free.id, unitPrice: 200000 }]);

    const res = await request(app.getHttpServer())
      .get(`/showtimes/${showtimeId}/manage/sales`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(res.body.totals).toMatchObject({ sold: 4, available: 3, revenue: 1350000 });
  });

  it('hides the report from other organizers, buyers and anonymous users', async () => {
    await request(app.getHttpServer())
      .get(`/showtimes/${showtimeId}/manage/sales`)
      .set('Cookie', otherOrganizer.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/showtimes/${showtimeId}/manage/sales`)
      .set('Cookie', buyer.cookie)
      .expect(403);
    await request(app.getHttpServer()).get(`/showtimes/${showtimeId}/manage/sales`).expect(401);
    await request(app.getHttpServer())
      .get(`/showtimes/${randomUUID()}/manage/sales`)
      .set('Cookie', owner.cookie)
      .expect(404);
  });

  it('returns zeros for a showtime without seats', async () => {
    const empty = await db.showtime.create({
      data: { eventId, startTime: new Date('2026-12-21T12:00:00Z'), status: 'DRAFT' },
    });
    try {
      const res = await request(app.getHttpServer())
        .get(`/showtimes/${empty.id}/manage/sales`)
        .set('Cookie', owner.cookie)
        .expect(200);
      expect(res.body.categories).toEqual([]);
      expect(res.body.totals).toEqual({ totalSeats: 0, sold: 0, held: 0, available: 0, revenue: 0 });
    } finally {
      await db.showtime.delete({ where: { id: empty.id } });
    }
  });
});
