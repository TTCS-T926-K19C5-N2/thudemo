import { assertIntegrationDatabase } from './integration-database.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';

describe('S10 configurable first-round TTL on real PostgreSQL', () => {
  const apps: INestApplication[] = [];
  const shows: string[] = [];
  let db: PrismaService, userId: string, eventId: string, cookie: string;
  beforeAll(async () => {
    assertIntegrationDatabase();
    if (process.env.HOLD_EXPIRY_MODE !== 'off') throw Error('Worker-off fixture required');
    for (const ttl of ['600', '120']) {
      const configuredUrl = new URL(process.env.DATABASE_URL!);
      if (ttl !== '600') configuredUrl.searchParams.set('options', '-c app.hold_ttl_seconds=' + ttl);
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ConfigService)
        .useValue(new ConfigService({ ...process.env, DATABASE_URL: configuredUrl.href }))
        .compile();
      const app = module.createNestApplication();
      await app.init();
      apps.push(app);
    }
    db = apps[0].get(PrismaService);
    const role = await db.role.upsert({
      where: { name: 'BUYER' },
      create: { name: 'BUYER' },
      update: {},
    });
    userId = (
      await db.user.create({
        data: {
          email: `ttl-${randomUUID()}@demo.invalid`,
          password: 'not-login-fixture',
          isEmailVerified: true,
          userRoles: { create: { roleId: role.id } },
        },
      })
    ).id;
    const token = randomBytes(32).toString('base64url');
    cookie = `${SESSION_COOKIE}=${token}`;
    await db.session.create({
      data: {
        userId,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    eventId = (
      await db.event.create({
        data: {
          name: 'TTL synthetic fixture',
          description: 'Test only',
          location: 'Test',
          organizerId: userId,
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
        await db.showtime.deleteMany({ where: { id: { in: shows } } });
        await db.event.delete({ where: { id: eventId } });
        await db.user.delete({ where: { id: userId } });
      }
    } finally {
      for (const app of apps) {
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
    const c = await db.seatCategory.create({
      data: { showtimeId: show.id, name: 'VIP', price: 100000 },
    });
    const seats = await db.seat.createManyAndReturn({
      data: [1, 2].map((seatNumber) => ({
        showtimeId: show.id,
        categoryId: c.id,
        row: 'T',
        seatNumber,
      })),
    });
    return { show: show.id, seats: seats.map((s) => s.id) };
  }
  const claim = (f: { show: string }, seatIds: string[], side = 0) =>
    request(apps[side].getHttpServer())
      .post(`/showtimes/${f.show}/holds`)
      .set('Cookie', cookie)
      .send({ seatIds });
  function ttlOf(body: { hold: { expiresAt: string }; serverTime: string }) {
    return Date.parse(body.hold.expiresAt) - Date.parse(body.serverTime);
  }
  it('uses server600seconds by default and120seconds for a configured new round', async () => {
    for (const [side, seconds] of [
      [0, 600],
      [1, 120],
    ]) {
      const f = await fixture();
      const held = await claim(f, [f.seats[0]], side).expect(200);
      expect(ttlOf(held.body)).toBeGreaterThan(seconds * 1000 - 1000);
      expect(ttlOf(held.body)).toBeLessThanOrEqual(seconds * 1000);
    }
  });
  it('retains an existing600-second deadline when the other API is configured for120seconds, including order creation', async () => {
    const f = await fixture();
    const first = await claim(f, [f.seats[0]], 0).expect(200);
    const added = await claim(f, [f.seats[1]], 1).expect(200);
    expect(added.body.hold.expiresAt).toBe(first.body.hold.expiresAt);
    expect(added.body.hold.seatIds.sort()).toEqual([...f.seats].sort());
    const order = await request(apps[1].getHttpServer())
      .post(`/showtimes/${f.show}/orders`)
      .set('Cookie', cookie)
      .send({})
      .expect(200);
    expect(order.body.order.paymentExpiresAt).toBe(first.body.hold.expiresAt);
  });
  it('does not extend a120-second round when retry/add comes from an API configured for600seconds', async () => {
    const f = await fixture();
    const first = await claim(f, [f.seats[0]], 1).expect(200);
    const retry = await claim(f, [f.seats[0]], 0).expect(200);
    expect(retry.body.hold).toEqual(first.body.hold);
    const added = await claim(f, [f.seats[1]], 0).expect(200);
    expect(added.body.hold.expiresAt).toBe(first.body.hold.expiresAt);
    const stored = await db.holdSession.findUniqueOrThrow({
      where: { id: first.body.hold.id },
    });
    expect(stored.expiresAt.toISOString()).toBe(first.body.hold.expiresAt);
  });
  it('rejects a client TTL override without creating any hold', async () => {
    const f = await fixture();
    await request(apps[0].getHttpServer())
      .post(`/showtimes/${f.show}/holds`)
      .set('Cookie', cookie)
      .send({ seatIds: [f.seats[0]], ttlSeconds: 1 })
      .expect(400);
    expect(await db.holdSession.count({ where: { showtimeId: f.show } })).toBe(
      0,
    );
  });
  it('clears the transaction-local TTL before reusing the same connection and preserves legacy fallback600', async () => {
    const probe = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL!,
        max: 1,
      }),
    });
    try {
      const f = await fixture();
      await probe.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.hold_ttl_seconds', '120', true)`;
        await tx.$queryRaw`SELECT * FROM public.claim_hold_v6(${f.show}::uuid,${userId}::uuid,${'probe-' + randomUUID()},${'{' + f.seats[0] + '}'}::uuid[],${randomUUID()}::uuid,${randomUUID()}::uuid)`;
      });
      const [setting] = await probe.$queryRaw<
        { value: string | null }[]
      >`SELECT NULLIF(current_setting('app.hold_ttl_seconds',true),'') AS value`;
      expect(setting.value).toBeNull();
      const legacy = await fixture();
      const [held] = await probe.$queryRaw<
        { expiresAt: Date; serverTime: Date }[]
      >`SELECT * FROM public.claim_hold_v6(${legacy.show}::uuid,${userId}::uuid,${'legacy-' + randomUUID()},${'{' + legacy.seats[0] + '}'}::uuid[],${randomUUID()}::uuid,${randomUUID()}::uuid)`;
      const delta = held.expiresAt.getTime() - held.serverTime.getTime();
      expect(delta).toBeGreaterThan(599000);
      expect(delta).toBeLessThanOrEqual(600000);
    } finally {
      await probe.$disconnect();
    }
  });
});
