import { assertIntegrationDatabase } from './integration-database.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { AppModule } from '../src/app.module.js';
import { BookingAccessService } from '../src/booking-access/booking-access.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('S40 waiting room with run-local explicit limits', () => {
  let app: INestApplication;
  let db: PrismaService;
  let access: BookingAccessService;
  let redis: Redis;
  let eventId: string;
  let showtimeId: string;
  const userIds: string[] = [];
  const buyerIds: string[] = [];
  const cookies: string[] = [];
  const envBefore = new Map<string, string | undefined>();
  const testEnv: Record<string, string> = {
    WAITING_ROOM_CAPACITY: '1',
    WAITING_ROOM_LEASE_SECONDS: '10',
    BOOKING_HOLD_ACCOUNT_LIMIT: '1000',
    BOOKING_HOLD_IP_LIMIT: '10000',
    BOOKING_ORDER_ACCOUNT_LIMIT: '1000',
    BOOKING_ORDER_IP_LIMIT: '10000',
  };

  async function createBuyer() {
    await db.role.createMany({
      data: [{ name: 'BUYER' }],
      skipDuplicates: true,
    });
    const role = await db.role.findUniqueOrThrow({ where: { name: 'BUYER' } });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@s40-waiting-room-e2e.test`,
        password: 'secure-test-password',
        isEmailVerified: true,
        userRoles: { create: { roleId: role.id } },
      },
    });
    userIds.push(user.id);
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 120_000),
      },
    });
    return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  beforeAll(async () => {
    assertIntegrationDatabase();
    for (const [key, value] of Object.entries(testEnv)) {
      envBefore.set(key, process.env[key]);
      process.env[key] = value;
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    access = app.get(BookingAccessService);
    redis = app.get<Redis>('REDIS_CLIENT');

    const [organizerId, first, second, third] = await Promise.all([
      (async () => {
        await db.role.createMany({
          data: [{ name: 'ORGANIZER' }],
          skipDuplicates: true,
        });
        const role = await db.role.findUniqueOrThrow({
          where: { name: 'ORGANIZER' },
        });
        const user = await db.user.create({
          data: {
            email: `${randomUUID()}@s40-waiting-room-e2e.test`,
            password: 'secure-test-password',
            isEmailVerified: true,
            userRoles: { create: { roleId: role.id } },
          },
        });
        userIds.push(user.id);
        return user.id;
      })(),
      createBuyer(),
      createBuyer(),
      createBuyer(),
    ]);
    buyerIds.push(first.id, second.id, third.id);
    cookies.push(first.cookie, second.cookie, third.cookie);
    const event = await db.event.create({
      data: {
        name: 'S40 waiting room test',
        description: 'Run-bound isolated Redis fixture',
        location: 'Test venue',
        organizerId,
        status: 'PUBLISHED',
      },
    });
    eventId = event.id;
    const showtime = await db.showtime.create({
      data: {
        eventId,
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
        status: 'ON_SALE',
      },
    });
    showtimeId = showtime.id;
    expect(buyerIds).toHaveLength(3);
  }, 30_000);

  afterAll(async () => {
    if (redis && showtimeId) {
      const keys = await redis.keys(`booking:*:{${showtimeId}}:*`);
      if (keys.length) await redis.unlink(...keys);
    }
    if (db && showtimeId) {
      await db.showtime.deleteMany({ where: { id: showtimeId } });
      await db.event.deleteMany({ where: { id: eventId } });
    }
    if (db && userIds.length) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    for (const [key, value] of envBefore) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('enqueues in FIFO order, rejects direct booking bypass, and expires/promotes the lease', async () => {
    const [firstCookie, secondCookie, thirdCookie] = cookies;
    const first = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/waiting-room`)
      .set('Cookie', firstCookie)
      .expect(200);
    expect(first.body).toMatchObject({
      enabled: true,
      admitted: true,
      position: 0,
    });
    expect(Date.parse(first.body.expiresAt)).toBeGreaterThan(Date.now());

    const second = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/waiting-room`)
      .set('Cookie', secondCookie)
      .expect(200);
    const third = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/waiting-room`)
      .set('Cookie', thirdCookie)
      .expect(200);
    expect(second.body).toMatchObject({
      enabled: true,
      admitted: false,
      position: 1,
    });
    expect(third.body).toMatchObject({
      enabled: true,
      admitted: false,
      position: 2,
    });

    for (const pathBody of [
      [`/showtimes/${showtimeId}/holds`, {}],
      ['/orders', { showtimeId }],
    ] as const) {
      const denied = await request(app.getHttpServer())
        .post(pathBody[0])
        .set('Cookie', secondCookie)
        .send(pathBody[1])
        .expect(429);
      expect(denied.body.code).toBe('WAITING_ROOM_REQUIRED');
    }

    await new Promise((resolve) => setTimeout(resolve, access.leaseMs + 500));
    const promoted = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/waiting-room`)
      .set('Cookie', secondCookie)
      .expect(200);
    expect(promoted.body).toMatchObject({
      enabled: true,
      admitted: true,
      position: 0,
    });
    expect(await access.admitted(showtimeId, buyerIds[1])).toBe(true);
    expect(await access.admitted(showtimeId, buyerIds[0])).toBe(false);
    for (const [path, body] of [
      [`/showtimes/${showtimeId}/holds`, {}],
      ['/orders', { showtimeId }],
    ] as const) {
      const expiredLease = await request(app.getHttpServer())
        .post(path)
        .set('Cookie', firstCookie)
        .send(body)
        .expect(429);
      expect(expiredLease.body.code).toBe('WAITING_ROOM_REQUIRED');
    }

    await new Promise((resolve) => setTimeout(resolve, access.leaseMs + 500));
    const next = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/waiting-room`)
      .set('Cookie', thirdCookie)
      .expect(200);
    expect(next.body).toMatchObject({
      enabled: true,
      admitted: true,
      position: 0,
    });
    expect(await access.admitted(showtimeId, buyerIds[2])).toBe(true);
    expect(await access.admitted(showtimeId, buyerIds[1])).toBe(false);
  }, 30_000);
});
