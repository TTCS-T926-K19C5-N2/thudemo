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
  const userIds: string[] = [];
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
    // Empty-update upserts may degrade to a read followed by an insert and
    // race with another Vitest worker creating the same shared role.
    await db.role.createMany({
      data: [{ name: role }],
      skipDuplicates: true,
    });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@demo.invalid`,
        password: 'not-a-login-hash-fixture',
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
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (
      target.hostname !== '127.0.0.1' ||
      target.port !== '15432' ||
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
      // A failed beforeAll leaves eventId unset. Never pass an undefined
      // fixture key to Prisma because it can omit that filter entirely.
      if (eventId) {
        const shows = await db.showtime.findMany({
          where: { eventId },
          select: { id: true },
        });
        const ids = shows.map((s) => s.id);
        await db.seat.deleteMany({ where: { showtimeId: { in: ids } } });
        await db.seatCategory.deleteMany({
          where: { showtimeId: { in: ids } },
        });
        await db.showtime.deleteMany({ where: { eventId } });
        await db.event.deleteMany({ where: { id: eventId } });
      }
      if (userIds.length)
        await db.user.deleteMany({ where: { id: { in: userIds } } });
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
          process.env.SPRINT2_EVIDENCE_DIR ?? '../../evidence/sprint2/20261004-local',
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
});
