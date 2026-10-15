import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { SEAT_STATUS_SQL } from '../src/showtimes/seat-status.sql.js';
describe('Sprint 2 isolated database integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let owner: string;
  let other: string;
  let buyer: string;
  let cookie: string;
  let otherCookie: string;
  let buyerCookie: string;
  let eventId: string;
  let showId: string;
  const extraBuyerIds: string[] = [];
  const samples: Record<string, number[]> = {
    importMs: [],
    queryMs: [],
    catalogColdMs: [],
    catalogWarmMs: [],
  };
  const fixture = {
    seats: Array.from({ length: 2000 }, (_, i) => ({
      row: `R${Math.floor(i / 50)}`,
      seatNumber: (i % 50) + 1,
      category: i < 400 ? 'VIP' : 'Standard',
    })),
  };
  async function account(role: string) {
    // Parallel E2E files share role names. Insert atomically, matching the
    // auth/events fixtures, rather than a read-then-create empty-update upsert.
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@demo.invalid`,
        password: 'not-a-login-hash-fixture',
        isEmailVerified: true,
        userRoles: { create: { roleId: r.id } },
      },
    });
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
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (
      target.hostname !== '127.0.0.1' ||
      (target.port !== '15432' &&
        (target.port !== '15434' ||
          process.env.S32_ISOLATED_TEST !== 'true')) ||
      target.pathname !== '/sprint2_integration'
    )
      throw new Error('Run only on the isolated sprint2_integration database');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    const a = await account('ORGANIZER'),
      b = await account('ORGANIZER'),
      c = await account('BUYER');
    owner = a.id;
    other = b.id;
    buyer = c.id;
    cookie = a.cookie;
    otherCookie = b.cookie;
    buyerCookie = c.cookie;
    const e = await db.event.create({
      data: {
        name: 'Concert integration fixture',
        posterPath: '/images/events/autumn-symphony.jpg',
        categoryLabel: 'Thính phòng',
        description: 'Dữ liệu giả',
        location: 'Nhà hát giả lập',
        organizerId: owner,
      },
    });
    eventId = e.id;
    showId = (
      await db.showtime.create({
        data: { eventId, startTime: new Date('2026-10-16T12:00:00Z') },
      })
    ).id;
  });
  afterAll(async () => {
    if (db) {
      const shows = await db.showtime.findMany({
        where: { eventId },
        select: { id: true },
      });
      const ids = shows.map((s) => s.id);
      await db.orderItem.deleteMany({
        where: { order: { showtimeId: { in: ids } } },
      });
      await db.order.deleteMany({ where: { showtimeId: { in: ids } } });
      await db.seatHold.deleteMany({ where: { showtimeId: { in: ids } } });
      await db.holdSession.deleteMany({ where: { showtimeId: { in: ids } } });
      await db.seat.deleteMany({ where: { showtimeId: { in: ids } } });
      await db.seatCategory.deleteMany({ where: { showtimeId: { in: ids } } });
      await db.showtime.deleteMany({ where: { eventId } });
      await db.event.delete({ where: { id: eventId } });
      await db.user.deleteMany({
        where: { id: { in: [owner, other, buyer, ...extraBuyerIds] } },
      });
      const report = {
        date: new Date().toISOString(),
        runtime: process.version,
        mode: 'Nest HTTP via supertest; real PostgreSQL15/Redis7 Docker; Windows local',
        dataset: { seats: 2000, showtimes: 200 },
        samples,
        p95: Object.fromEntries(
          Object.entries(samples).map(([k, v]) => [
            k,
            [...v].sort((a, b) => a - b)[Math.ceil(v.length * 0.95) - 1],
          ]),
        ),
      };
      const dir = resolve(
        process.env.VERIFICATION_EVIDENCE_DIR ??
          process.env.SPRINT2_EVIDENCE_DIR ??
          '../../evidence/sprint2/20261004-local',
      );
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, 'integration-performance.json'),
        JSON.stringify(report, null, 2),
      );
    }
    if (app) {
      await app.get('REDIS_CLIENT').quit();
      await app.close();
    }
  });
  it('projects sold/held/expired inventory fixtures in the production SQL expression using DB time', async () => {
    const rows = await db.$queryRaw<
      { id: string; status: string }[]
    >`SELECT inventory.id, ${SEAT_STATUS_SQL} AS status FROM (VALUES
      ('free', false, NULL::timestamptz),
      ('held', false, clock_timestamp()+interval '1 minute'),
      ('expired', false, clock_timestamp()-interval '1 minute'),
      ('sold', true, NULL::timestamptz)
    ) inventory(id, sold, "expiresAt")`;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      free: 'AVAILABLE',
      held: 'HELD',
      expired: 'AVAILABLE',
      sold: 'SOLD',
    });
  });
  it('enforces authentication, role, owner, input and open conditions', async () => {
    await request(app.getHttpServer())
      .post(`/showtimes/${showId}/seat-map`)
      .send(fixture)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/showtimes/${showId}/seat-map`)
      .set('Cookie', buyerCookie)
      .send(fixture)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/showtimes/${showId}/seat-map`)
      .set('Cookie', otherCookie)
      .send(fixture)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'ON_SALE' })
      .expect(409);
    const broken = {
      seats: [
        ...fixture.seats.slice(0, -1),
        { row: '', seatNumber: 'x', category: '' },
      ],
    };
    const bad = await request(app.getHttpServer())
      .post(`/showtimes/${showId}/seat-map`)
      .set('Cookie', cookie)
      .send(broken)
      .expect(400);
    expect(bad.body.errors).toHaveLength(3);
    expect(await db.seat.count({ where: { showtimeId: showId } })).toBe(0);
    expect(await db.seatCategory.count({ where: { showtimeId: showId } })).toBe(
      0,
    );
    const preview = await request(app.getHttpServer())
      .post('/showtimes/validate-map')
      .set('Cookie', cookie)
      .send(fixture)
      .expect(201);
    expect(preview.body.errors).toEqual([]);
    expect(await db.seat.count({ where: { showtimeId: showId } })).toBe(0);
  }, 15000);
  it('batch imports 2000; failure preserves existing data; DB constraints rollback categories', async () => {
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await request(app.getHttpServer())
        .post(`/showtimes/${showId}/seat-map`)
        .set('Cookie', cookie)
        .send(fixture)
        .expect(201);
      samples.importMs.push(performance.now() - start);
    }
    expect(Math.max(...samples.importMs)).toBeLessThan(5000);
    const before = await db.seat.findMany({
      where: { showtimeId: showId },
      select: { id: true },
    });
    await request(app.getHttpServer())
      .post(`/showtimes/${showId}/seat-map`)
      .set('Cookie', cookie)
      .send({ seats: [...fixture.seats, fixture.seats[0]] })
      .expect(400);
    expect(
      await db.seat.findMany({
        where: { showtimeId: showId },
        select: { id: true },
      }),
    ).toEqual(before);
    await expect(
      db.$transaction(async (tx) => {
        const category = await tx.seatCategory.create({
          data: { showtimeId: showId, name: 'ROLLBACK_ONLY' },
        });
        await tx.seat.create({
          data: {
            showtimeId: showId,
            categoryId: category.id,
            row: fixture.seats[0].row,
            seatNumber: fixture.seats[0].seatNumber,
          },
        });
      }),
    ).rejects.toThrow();
    expect(
      await db.seatCategory.count({
        where: { showtimeId: showId, name: 'ROLLBACK_ONLY' },
      }),
    ).toBe(0);
  }, 30000);
  it('distinguishes null from free, validates price and locks structure through close/reopen', async () => {
    const categories = await db.seatCategory.findMany({
      where: { showtimeId: showId },
      orderBy: { name: 'asc' },
    });
    expect(categories.every((c) => c.price === null)).toBe(true);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'ON_SALE' })
      .expect(409);
    for (const price of [-1, 1.5, 2147483648, '100', null])
      await request(app.getHttpServer())
        .patch(`/showtimes/${showId}/prices`)
        .set('Cookie', cookie)
        .send({ prices: [{ id: categories[0].id, price }] })
        .expect(400);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/prices`)
      .set('Cookie', otherCookie)
      .send({ prices: [{ id: categories[0].id, price: 0 }] })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/prices`)
      .set('Cookie', cookie)
      .send({
        prices: categories.map((c, i) => ({ id: c.id, price: i * 350000 })),
      })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'ON_SALE' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/showtimes/${showId}/seat-map`)
      .set('Cookie', cookie)
      .send(fixture)
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'CLOSED' })
      .expect(200);
    await request(app.getHttpServer()).get(`/showtimes/${showId}`).expect(404);
    await request(app.getHttpServer())
      .post(`/showtimes/${showId}/seat-map`)
      .set('Cookie', cookie)
      .send(fixture)
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'ON_SALE' })
      .expect(200);
    const privateDraft = await db.showtime.create({
      data: { eventId, startTime: new Date('2026-10-17T12:30:00Z') },
    });
    const publishedClosed = await db.showtime.create({
      data: {
        eventId,
        startTime: new Date('2026-10-18T12:30:00Z'),
        status: 'CLOSED',
        structureLocked: true,
      },
    });
    const publicDetail = await request(app.getHttpServer())
      .get(`/showtimes/${showId}`)
      .expect(200);
    expect(publicDetail.body.event.posterPath).toBe(
      '/images/events/autumn-symphony.jpg',
    );
    expect(
      publicDetail.body.siblings.some(
        (slot: { id: string }) => slot.id === privateDraft.id,
      ),
    ).toBe(false);
    expect(
      publicDetail.body.siblings.some(
        (slot: { id: string }) => slot.id === publishedClosed.id,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(`/showtimes/${publishedClosed.id}`)
      .expect(404);
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      const map = await request(app.getHttpServer())
        .get(`/showtimes/${showId}/seats`)
        .expect(200);
      samples.queryMs.push(performance.now() - start);
      expect(map.body).toHaveLength(2000);
      expect(map.body[0]).not.toHaveProperty('holderId');
    }
    expect(Math.max(...samples.queryMs)).toBeLessThan(200);
  }, 30000);
  it('paginates 200 shows at tied dates, cache revision changes on price/close, omits internal fields', async () => {
    const created = await db.showtime.createManyAndReturn({
      data: Array.from({ length: 199 }, () => ({
        eventId,
        startTime: new Date('2026-10-16T12:00:00Z'),
        status: 'ON_SALE' as const,
      })),
    });
    await db.seatCategory.createMany({
      data: created.map((s) => ({
        showtimeId: s.id,
        name: 'Standard',
        price: 1000,
      })),
    });
    await db.catalogRevision.update({
      where: { id: 1 },
      data: { version: { increment: 1 } },
    });
    let cursor: string | null = null;
    const ids: string[] = [];
    do {
      const res: request.Response = await request(app.getHttpServer())
        .get(`/showtimes${cursor ? `?cursor=${cursor}` : ''}`)
        .expect(200);
      for (const item of res.body.items) {
        ids.push(item.id);
        expect(item).not.toHaveProperty('organizerId');
        expect(item.eventId).toBe(eventId);
        expect(item.posterPath).toBe('/images/events/autumn-symphony.jpg');
        expect(item.categoryLabel).toBe('Thính phòng');
      }
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(200);
    expect(new Set(ids).size).toBe(200);
    for (let i = 0; i < 30; i++) {
      await db.catalogRevision.update({
        where: { id: 1 },
        data: { version: { increment: 1 } },
      });
      let start = performance.now();
      await request(app.getHttpServer()).get('/showtimes').expect(200);
      samples.catalogColdMs.push(performance.now() - start);
      start = performance.now();
      await request(app.getHttpServer()).get('/showtimes').expect(200);
      samples.catalogWarmMs.push(performance.now() - start);
    }
    expect(Math.max(...samples.catalogColdMs)).toBeLessThan(500);
    const cachedPage = await request(app.getHttpServer())
      .get('/showtimes')
      .expect(200);
    const target = created.find((s) =>
      cachedPage.body.items.some((item: { id: string }) => item.id === s.id),
    )!;
    const category = await db.seatCategory.findFirstOrThrow({
      where: { showtimeId: target.id },
    });
    await request(app.getHttpServer())
      .patch(`/showtimes/${target.id}/prices`)
      .set('Cookie', cookie)
      .send({ prices: [{ id: category.id, price: 0 }] })
      .expect(200);
    const repriced = await request(app.getHttpServer())
      .get('/showtimes')
      .expect(200);
    expect(
      repriced.body.items.find((item: { id: string }) => item.id === target.id)
        .minPrice,
    ).toBe(0);
    await request(app.getHttpServer())
      .patch(`/showtimes/${target.id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'CLOSED' })
      .expect(200);
    const page = await request(app.getHttpServer())
      .get('/showtimes')
      .expect(200);
    expect(
      page.body.items.some((s: { id: string }) => s.id === target.id),
    ).toBe(false);
    await request(app.getHttpServer()).get('/showtimes?cursor=bad').expect(400);
  }, 30000);
  it('creates one pending order from live holds, snapshots prices, preserves the original hold deadline and rejects expired seats', async () => {
    const available = await db.seat.findMany({
      where: { showtimeId: showId },
      orderBy: [{ categoryId: 'asc' }, { row: 'asc' }, { seatNumber: 'asc' }],
      include: { category: true },
    });
    const firstCategory = available[0].category;
    const firstSeats = available
      .filter((seat) => seat.categoryId === firstCategory.id)
      .slice(0, 2);

    const held = await request(app.getHttpServer())
      .post(`/showtimes/${showId}/holds`)
      .set('Cookie', buyerCookie)
      .send({ seatIds: firstSeats.map((seat) => seat.id) })
      .expect(200);
    const holdExpiresAt = Date.parse(held.body.hold.expiresAt);

    const [placedA, placedB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/showtimes/${showId}/orders`)
        .set('Cookie', buyerCookie)
        .send({ totalAmount: 0, unitPrice: 0, userId: other })
        .expect(200),
      request(app.getHttpServer())
        .post(`/showtimes/${showId}/orders`)
        .set('Cookie', buyerCookie)
        .send({})
        .expect(200),
    ]);
    expect(placedA.body.order.id).toBe(placedB.body.order.id);
    expect(
      [placedA.body.created, placedB.body.created].sort(
        (a, b) => Number(a) - Number(b),
      ),
    ).toEqual([false, true]);
    expect(placedA.body.order.items).toHaveLength(2);
    expect(placedA.body.order.totalAmount).toBe(
      firstSeats.reduce((sum, seat) => sum + (seat.category.price ?? 0), 0),
    );
    const paymentExpiresAt = Date.parse(placedA.body.order.paymentExpiresAt);
    // Promise.all preserves input order, not which concurrent request won the lock.
    // Creation and retries share the original hold deadline (DEC-10).
    const created = placedA.body.created ? placedA : placedB;
    const reused = placedA.body.created ? placedB : placedA;
    expect(paymentExpiresAt).toBe(holdExpiresAt);
    expect(
      paymentExpiresAt - Date.parse(created.body.serverTime),
    ).toBeGreaterThan(0);
    expect(reused.body.order.paymentExpiresAt).toBe(
      created.body.order.paymentExpiresAt,
    );
    const remaining = paymentExpiresAt - Date.parse(reused.body.serverTime);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(600000);
    expect(paymentExpiresAt).toBe(holdExpiresAt);
    expect(
      await db.order.count({
        where: { userId: buyer, showtimeId: showId },
      }),
    ).toBe(1);
    const currentOrder = await request(app.getHttpServer())
      .get(`/orders/${placedA.body.order.id}`)
      .set('Cookie', buyerCookie)
      .expect(200);
    expect(currentOrder.body.order.status).toBe('PENDING_PAYMENT');
    const extended = await db.seatHold.findMany({
      where: { seatId: { in: firstSeats.map((seat) => seat.id) } },
      select: { expiresAt: true },
    });
    expect(
      extended.every((seat) => seat.expiresAt.getTime() === paymentExpiresAt),
    ).toBe(true);

    const newPrice = (firstCategory.price ?? 0) + 12345;
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/prices`)
      .set('Cookie', cookie)
      .send({ prices: [{ id: firstCategory.id, price: newPrice }] })
      .expect(200);
    const oldItems = await db.orderItem.findMany({
      where: { orderId: placedA.body.order.id },
    });
    expect(
      oldItems.every((item) => item.unitPrice === firstCategory.price),
    ).toBe(true);

    const secondBuyer = await account('BUYER');
    extraBuyerIds.push(secondBuyer.id);
    await request(app.getHttpServer())
      .get(`/orders/${placedA.body.order.id}`)
      .set('Cookie', secondBuyer.cookie)
      .expect(403);
    const freshSeat = available.find(
      (seat) =>
        seat.categoryId === firstCategory.id &&
        !firstSeats.some((heldSeat) => heldSeat.id === seat.id),
    )!;
    await request(app.getHttpServer())
      .post(`/showtimes/${showId}/holds`)
      .set('Cookie', secondBuyer.cookie)
      .send({ seatIds: [freshSeat.id] })
      .expect(200);
    const newOrder = await request(app.getHttpServer())
      .post(`/showtimes/${showId}/orders`)
      .set('Cookie', secondBuyer.cookie)
      .send({})
      .expect(200);
    expect(newOrder.body.order.items[0].unitPrice).toBe(newPrice);

    const expiredBuyer = await account('BUYER');
    extraBuyerIds.push(expiredBuyer.id);
    const expiringSeat = available.find(
      (seat) =>
        seat.categoryId !== firstCategory.id &&
        !firstSeats.some((heldSeat) => heldSeat.id === seat.id),
    )!;
    const expiringHold = await request(app.getHttpServer())
      .post(`/showtimes/${showId}/holds`)
      .set('Cookie', expiredBuyer.cookie)
      .send({ seatIds: [expiringSeat.id] })
      .expect(200);
    await db.seatHold.update({
      where: { seatId: expiringSeat.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app.getHttpServer())
      .post(`/showtimes/${showId}/orders`)
      .set('Cookie', expiredBuyer.cookie)
      .send({})
      .expect(409);
    expect(expired.body.code).toBe('HOLD_EXPIRED');
    expect(expired.body.lostSeatIds).toContain(expiringSeat.id);
    expect(
      await db.order.count({
        where: { userId: expiredBuyer.id, showtimeId: showId },
      }),
    ).toBe(0);
    expect(expiringHold.body.hold.seatIds).toContain(expiringSeat.id);
    await db.order.update({
      where: { id: placedA.body.order.id },
      data: { paymentExpiresAt: new Date(Date.now() - 1000) },
    });
    const elapsed = await request(app.getHttpServer())
      .get(`/orders/${placedA.body.order.id}`)
      .set('Cookie', buyerCookie)
      .expect(200);
    expect(elapsed.body.order.status).toBe('EXPIRED');
  }, 30000);
});
