import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('S-15/S-16 pending orders', () => {
  let app: INestApplication;
  let db: PrismaService;
  let eventId: string;
  let showtimeId: string;
  let organizerCookie: string;
  const users: string[] = [];
  const buyerCookies: string[] = [];
  const categories: Record<string, string> = {};
  const seats: Record<string, string> = {};

  async function account(roleName: 'ORGANIZER' | 'BUYER') {
    const role = await db.role.upsert({
      where: { name: roleName },
      create: { name: roleName },
      update: {},
    });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@orders.demo.invalid`,
        password: 'not-a-login-hash-fixture',
        isEmailVerified: true,
        userRoles: { create: { roleId: role.id } },
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    users.push(user.id);
    return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  async function hold(cookie: string, seatIds: string[]) {
    const response = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/holds`)
      .set('Cookie', cookie)
      .send({ seatIds })
      .expect(200);
    return response.body.hold as {
      id: string;
      expiresAt: string;
      seatIds: string[];
    };
  }

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (
      target.hostname !== '127.0.0.1' ||
      target.port !== '15432' ||
      target.pathname !== '/sprint2_integration'
    )
      throw new Error('Run only on the isolated sprint2_integration database');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);

    const organizer = await account('ORGANIZER');
    organizerCookie = organizer.cookie;
    for (let index = 0; index < 3; index += 1)
      buyerCookies.push((await account('BUYER')).cookie);

    const event = await db.event.create({
      data: {
        name: 'S-16 order fixture',
        description: 'Dữ liệu kiểm thử đơn hàng',
        location: 'Nhà hát kiểm thử',
        organizerId: organizer.id,
      },
    });
    eventId = event.id;
    const showtime = await db.showtime.create({
      data: {
        eventId,
        startTime: new Date('2026-12-20T12:00:00Z'),
        status: 'ON_SALE',
        structureLocked: true,
      },
    });
    showtimeId = showtime.id;
    for (const [name, price] of [
      ['VIP', 1_000_000],
      ['Standard', 500_000],
      ['Balcony', 250_000],
    ] as const) {
      const category = await db.seatCategory.create({
        data: { showtimeId, name, price },
      });
      categories[name] = category.id;
    }
    for (const [key, category, row, seatNumber] of [
      ['vip-1', 'VIP', 'A', 1],
      ['vip-2', 'VIP', 'A', 2],
      ['standard-1', 'Standard', 'B', 1],
      ['balcony-1', 'Balcony', 'C', 1],
      ['balcony-2', 'Balcony', 'C', 2],
    ] as const) {
      const seat = await db.seat.create({
        data: {
          showtimeId,
          categoryId: categories[category],
          row,
          seatNumber,
        },
      });
      seats[key] = seat.id;
    }
  });

  afterAll(async () => {
    if (db) {
      await db.orderItem.deleteMany({ where: { order: { showtimeId } } });
      await db.order.deleteMany({ where: { showtimeId } });
      await db.seatHold.deleteMany({ where: { showtimeId } });
      await db.holdSession.deleteMany({ where: { showtimeId } });
      await db.seat.deleteMany({ where: { showtimeId } });
      await db.seatCategory.deleteMany({ where: { showtimeId } });
      await db.showtime.delete({ where: { id: showtimeId } });
      await db.event.delete({ where: { id: eventId } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
    if (app) {
      await app.get('REDIS_CLIENT').quit();
      await app.close();
    }
  });

  it('creates one pending order for a double click and snapshots its prices', async () => {
    const current = await hold(buyerCookies[0], [
      seats['vip-1'],
      seats['standard-1'],
    ]);
    const submit = () =>
      request(app.getHttpServer())
        .post(`/showtimes/${showtimeId}/orders`)
        .set('Cookie', buyerCookies[0])
        .send({ holdId: current.id, seatIds: current.seatIds })
        .expect(200);
    const [first, second] = await Promise.all([submit(), submit()]);
    expect(first.body.order.id).toBe(second.body.order.id);
    expect([first.body.created, second.body.created].sort((a, b) => Number(a) - Number(b))).toEqual([
      false,
      true,
    ]);
    expect(first.body.order.totalAmount).toBe('1500000');
    expect(first.body.order.items).toHaveLength(2);
    const paymentWindow =
      Date.parse(first.body.order.paymentExpiresAt) -
      Date.parse(first.body.serverTime);
    expect(paymentWindow).toBeGreaterThan(14 * 60 * 1000);
    expect(paymentWindow).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(
      await db.order.count({
        where: { buyerId: users[1], showtimeId, status: 'PENDING_PAYMENT' },
      }),
    ).toBe(1);
    const storedHold = await db.holdSession.findUniqueOrThrow({
      where: { id: current.id },
    });
    const storedOrder = await db.order.findUniqueOrThrow({
      where: { id: first.body.order.id },
    });
    expect(storedHold.expiresAt.getTime()).toBe(
      storedOrder.paymentExpiresAt.getTime(),
    );

    await request(app.getHttpServer())
      .patch(`/showtimes/${showtimeId}/prices`)
      .set('Cookie', organizerCookie)
      .send({ prices: [{ id: categories.VIP, price: 1_200_000 }] })
      .expect(200);
    const unchanged = await request(app.getHttpServer())
      .get(`/orders/${first.body.order.id}`)
      .set('Cookie', buyerCookies[0])
      .expect(200);
    expect(
      unchanged.body.order.items.find(
        (item: { categoryName: string }) => item.categoryName === 'VIP',
      ).unitPrice,
    ).toBe(1_000_000);
  });

  it('uses the new category price only for an order created later', async () => {
    const current = await hold(buyerCookies[1], [seats['vip-2']]);
    const response = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/orders`)
      .set('Cookie', buyerCookies[1])
      .send({ holdId: current.id, seatIds: current.seatIds })
      .expect(200);
    expect(response.body.order.totalAmount).toBe('1200000');
    expect(response.body.order.items[0].unitPrice).toBe(1_200_000);

    const retried = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/orders`)
      .set('Cookie', buyerCookies[1])
      .send({ holdId: current.id, seatIds: current.seatIds })
      .expect(200);
    expect(retried.body.created).toBe(false);
    expect(retried.body.order.id).toBe(response.body.order.id);
  });

  it('does not create an order when a requested hold has expired', async () => {
    const current = await hold(buyerCookies[2], [
      seats['balcony-1'],
      seats['balcony-2'],
    ]);
    const expiredAt = new Date(Date.now() - 1000);
    await db.seatHold.updateMany({
      where: { holdSessionId: current.id, seatId: seats['balcony-1'] },
      data: { expiresAt: expiredAt },
    });
    const response = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/orders`)
      .set('Cookie', buyerCookies[2])
      .send({ holdId: current.id, seatIds: current.seatIds })
      .expect(409);
    expect(response.body.code).toBe('HOLD_EXPIRED');
    expect(response.body.lostSeatIds).toEqual([seats['balcony-1']]);
    expect(
      await db.order.count({ where: { buyerId: users[3], showtimeId } }),
    ).toBe(0);
  });

  it('does not expose one buyer order to another buyer', async () => {
    const order = await db.order.findFirstOrThrow({
      where: { buyerId: users[1], showtimeId },
    });
    await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set('Cookie', buyerCookies[1])
      .expect(404);
  });
});
