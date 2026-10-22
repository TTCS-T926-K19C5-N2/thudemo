import { assertIntegrationDatabase } from './integration-database.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hash } from 'argon2';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';

describe('S14 account hold recovery on real stores', () => {
  let app: INestApplication,
    db: PrismaService,
    userId: string,
    otherId: string,
    eventId: string;
  let first: string, second: string, other: string;
  const password = 'S14-local-fixture-only-Password123!';
  const shows: string[] = [];
  async function cookie(id: string) {
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        userId: id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return `${SESSION_COOKIE}=${token}`;
  }
  beforeAll(async () => {
    assertIntegrationDatabase();
    if (process.env.HOLD_EXPIRY_MODE !== 'off')
      throw Error('Dedicated integration database and worker-off required');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    const role = await db.role.upsert({
      where: { name: 'BUYER' },
      create: { name: 'BUYER' },
      update: {},
    });
    const users = await Promise.all(
      [1, 2].map(async () =>
        db.user.create({
          data: {
            email: `s14-${randomUUID()}@demo.invalid`,
            password: await hash(password),
            isEmailVerified: true,
            userRoles: { create: { roleId: role.id } },
          },
        }),
      ),
    );
    userId = users[0].id;
    otherId = users[1].id;
    first = await cookie(userId);
    second = await cookie(userId);
    other = await cookie(otherId);
    eventId = (
      await db.event.create({
        data: {
          name: 'S14 isolated fixture',
          location: 'Test',
          description: 'Synthetic',
          organizerId: otherId,
          status: 'PUBLISHED',
        },
      })
    ).id;
  });
  afterAll(async () => {
    try {
      if (eventId) {
        const scope = { showtimeId: { in: shows } };
        await db.orderItem.deleteMany({ where: { order: scope } });
        await db.order.deleteMany({ where: scope });
        await db.seatHold.deleteMany({ where: scope });
        await db.holdSession.deleteMany({ where: scope });
        await db.seat.deleteMany({ where: scope });
        await db.seatCategory.deleteMany({ where: scope });
        await db.showtime.deleteMany({ where: { eventId } });
        await db.event.delete({ where: { id: eventId } });
        await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
      }
    } finally {
      if (app) {
        await app.get('REDIS_CLIENT').quit();
        await app.close();
      }
    }
  });
  async function fixture() {
    const show = await db.showtime.create({
      data: {
        eventId,
        startTime: new Date(Date.now() + 86400000),
        status: 'ON_SALE',
        maxTicketsPerUser: null,
      },
    });
    shows.push(show.id);
    const cat = await db.seatCategory.create({
      data: { showtimeId: show.id, name: 'Fixture', price: 200000 },
    });
    const seats = await db.seat.createManyAndReturn({
      data: [1, 2].map((seatNumber) => ({
        showtimeId: show.id,
        categoryId: cat.id,
        row: 'S14',
        seatNumber,
      })),
    });
    return { show: show.id, seats: seats.map((s) => s.id) };
  }
  const claim = (show: string, ids: string[], session: string) =>
    request(app.getHttpServer())
      .post(`/showtimes/${show}/holds`)
      .set('Cookie', session)
      .send({ seatIds: ids });
  const current = (show: string, session: string) =>
    request(app.getHttpServer())
      .get(`/showtimes/${show}/holds`)
      .set('Cookie', session);
  it('restores the same two seats/deadline in another authenticated session, including after logout/login', async () => {
    const f = await fixture();
    const held = await claim(f.show, f.seats, first).expect(200);
    expect((await current(f.show, second).expect(200)).body.hold).toEqual(
      held.body.hold,
    );
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', first)
      .expect(200);
    const buyer = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: buyer.email, password })
      .expect(200);
    const cookies = login.headers['set-cookie'];
    const fresh = (Array.isArray(cookies) ? cookies : [cookies])[0].split(
      ';',
    )[0];
    expect((await current(f.show, fresh).expect(200)).body.hold).toEqual(
      held.body.hold,
    );
    expect((await current(f.show, other).expect(200)).body.hold).toBeNull();
    await claim(f.show, f.seats, other).expect(409);
    expect((await current(f.show, fresh).expect(200)).body.hold).toEqual(
      held.body.hold,
    );
  });
  it('serializes parallel first holds from two sessions into one token/deadline and allows either session to place the full order', async () => {
    const f = await fixture();
    const a = await cookie(userId),
      b = await cookie(userId);
    const results = await Promise.all([
      claim(f.show, [f.seats[0]], a),
      claim(f.show, [f.seats[1]], b),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const rows = await db.holdSession.findMany({
      where: { showtimeId: f.show, userId },
    });
    expect(rows).toHaveLength(1);
    const state = await current(f.show, b).expect(200);
    expect(state.body.hold.seatIds.sort()).toEqual([...f.seats].sort());
    const order = await request(app.getHttpServer())
      .post(`/showtimes/${f.show}/orders`)
      .set('Cookie', b)
      .send({})
      .expect(200);
    expect(order.body.order.items).toHaveLength(2);
    expect(order.body.order.paymentExpiresAt).toBe(
      rows[0].expiresAt.toISOString(),
    );
    const retry = await claim(f.show, [f.seats[0]], a).expect(200);
    expect(retry.body.hold.expiresAt).toBe(rows[0].expiresAt.toISOString());
    expect(
      await db.holdSession.count({ where: { showtimeId: f.show, userId } }),
    ).toBe(1);
  });
  it('adopts a single legacy session locator without rewriting its token/deadline or requiring the old cookie', async () => {
    const f = await fixture();
    const deadline = new Date(Date.now() + 360000);
    const legacy = await db.holdSession.create({
      data: {
        showtimeId: f.show,
        userId,
        sessionHash: hashSessionToken('legacy-cookie-no-longer-present'),
        token: randomUUID(),
        expectedSeatIds: [f.seats[0]],
        expiresAt: deadline,
      },
    });
    await db.seatHold.create({
      data: {
        seatId: f.seats[0],
        showtimeId: f.show,
        holdSessionId: legacy.id,
        token: legacy.token,
        expiresAt: deadline,
      },
    });
    const fresh = await cookie(userId);
    expect((await current(f.show, fresh).expect(200)).body.hold.expiresAt).toBe(
      deadline.toISOString(),
    );
    const added = await claim(f.show, [f.seats[1]], fresh).expect(200);
    expect(added.body.hold.id).toBe(legacy.id);
    expect(added.body.hold.expiresAt).toBe(deadline.toISOString());
    const after = await db.holdSession.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(after.sessionHash).toBe(legacy.sessionHash);
    expect(after.token).toBe(legacy.token);
    expect(added.body.hold.seatIds.sort()).toEqual([...f.seats].sort());
  });

  it('fails closed on legacy split active rounds without moving claims or changing deadlines through either order route', async () => {
    const f = await fixture();
    for (const [index, seatId] of f.seats.entries()) {
      const hold = await db.holdSession.create({
        data: {
          showtimeId: f.show,
          userId,
          sessionHash: `legacy-split-${randomUUID()}`,
          token: randomUUID(),
          expectedSeatIds: [seatId],
          expiresAt: new Date(Date.now() + 360000 + index * 1000),
        },
      });
      await db.seatHold.create({
        data: {
          seatId,
          showtimeId: f.show,
          holdSessionId: hold.id,
          token: hold.token,
          expiresAt: hold.expiresAt,
        },
      });
    }
    const snapshot = async () => ({
      rounds: await db.holdSession.findMany({
        where: { showtimeId: f.show },
        orderBy: { id: 'asc' },
      }),
      claims: await db.seatHold.findMany({
        where: { showtimeId: f.show },
        orderBy: { seatId: 'asc' },
      }),
    });
    const before = await snapshot();
    const session = await cookie(userId);
    expect((await current(f.show, session).expect(503)).body.code).toBe(
      'HOLD_AMBIGUOUS',
    );
    await claim(f.show, [f.seats[0]], session).expect(503);
    expect(
      (
        await request(app.getHttpServer())
          .post(`/showtimes/${f.show}/orders`)
          .set('Cookie', session)
          .send({})
          .expect(409)
      ).body.code,
    ).toBe('HOLD_CHANGED');
    expect(
      (
        await request(app.getHttpServer())
          .post('/orders')
          .set('Cookie', session)
          .send({ showtimeId: f.show })
          .expect(409)
      ).body.code,
    ).toBe('HOLD_CHANGED');
    expect(await snapshot()).toEqual(before);
    expect(await db.order.count({ where: { showtimeId: f.show } })).toBe(0);
  });

  it('expiry hides both sessions equally and another buyer may reclaim without old-owner release', async () => {
    const f = await fixture();
    const a = await cookie(userId),
      b = await cookie(userId);
    const held = await claim(f.show, [f.seats[0]], a).expect(200);
    const expiry = new Date(Date.now() - 1000);
    await db.holdSession.update({
      where: { id: held.body.hold.id },
      data: { expiresAt: expiry },
    });
    await db.seatHold.update({
      where: { seatId: f.seats[0] },
      data: { expiresAt: expiry },
    });
    for (const session of [a, b])
      expect((await current(f.show, session).expect(200)).body.hold).toBeNull();
    const replacement = await claim(f.show, [f.seats[0]], other).expect(200);
    expect((await current(f.show, b).expect(200)).body.hold).toBeNull();
    expect(
      (await db.seatHold.findUniqueOrThrow({ where: { seatId: f.seats[0] } }))
        .holdSessionId,
    ).toBe(replacement.body.hold.id);
  });
});
