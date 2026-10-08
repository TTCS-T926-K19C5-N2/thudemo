import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from '../src/orders/orders.service.js';

describe('Orders S-17 E2E Integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let buyer1Cookie: string;
  let buyer1Id: string;
  let buyer2Cookie: string;
  let showtimeId: string;
  let eventId: string;
  let seat1Id: string;
  let seat2Id: string;

  async function createAccount(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@order-e2e.test`,
        password: 'secure-test-password',
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
      target.port !== '15432' ||
      target.pathname !== '/sprint2_integration'
    ) {
      throw new Error('Run only on the isolated sprint2_integration database');
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);

    const organizer = await createAccount('ORGANIZER');
    const b1 = await createAccount('BUYER');
    const b2 = await createAccount('BUYER');

    buyer1Id = b1.id;
    buyer1Cookie = b1.cookie;
    buyer2Cookie = b2.cookie;

    // Create event
    const event = await db.event.create({
      data: {
        name: 'Đêm Hòa Nhạc Giao Hưởng',
        description: 'Chương trình đỉnh cao',
        location: 'Nhà hát Hòa Bình',
        organizerId: organizer.id,
        status: 'PUBLISHED',
      },
    });
    eventId = event.id;

    // Create showtime
    const showtime = await db.showtime.create({
      data: {
        eventId: event.id,
        startTime: new Date('2026-12-25T19:00:00Z'),
        status: 'ON_SALE',
      },
    });
    showtimeId = showtime.id;

    // Create seat categories with prices
    const catVip = await db.seatCategory.create({
      data: {
        showtimeId: showtime.id,
        name: 'VIP',
        price: 500000,
      },
    });

    const catStandard = await db.seatCategory.create({
      data: {
        showtimeId: showtime.id,
        name: 'Standard',
        price: 300000,
      },
    });

    // Create seats
    const s1 = await db.seat.create({
      data: {
        showtimeId: showtime.id,
        categoryId: catVip.id,
        row: 'A',
        seatNumber: 1,
      },
    });
    const s2 = await db.seat.create({
      data: {
        showtimeId: showtime.id,
        categoryId: catStandard.id,
        row: 'A',
        seatNumber: 2,
      },
    });

    seat1Id = s1.id;
    seat2Id = s2.id;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('AC 1 & AC 2: creates order from held seats, ignores client-forged total, and views order details', async () => {
    // 1. Buyer 1 holds seats s1 and s2
    const claimRes = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/holds`)
      .set('Cookie', buyer1Cookie)
      .send({ seatIds: [seat1Id, seat2Id] })
      .expect(200);

    expect(claimRes.body.hold).toBeDefined();
    expect(claimRes.body.hold.seatIds).toEqual(
      expect.arrayContaining([seat1Id, seat2Id]),
    );

    // 2. Buyer 1 creates order, attempting to spoof totalAmount: 1000 and unitPrice: 50
    const createRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Cookie', buyer1Cookie)
      .send({
        showtimeId,
        seatIds: [seat1Id, seat2Id],
        totalAmount: 1000,
        unitPrice: 50,
      })
      .expect(201);

    const order = createRes.body;
    expect(order.id).toBeDefined();
    expect(order.status).toBe(OrderStatus.PENDING);
    // Expected total: 500000 (VIP) + 300000 (Standard) = 800000
    expect(order.totalAmount).toBe(800000);
    expect(order.event.name).toBe('Đêm Hòa Nhạc Giao Hưởng');
    expect(order.showtime.id).toBe(showtimeId);
    expect(order.items).toHaveLength(2);
    expect(order.remainingSeconds).toBeGreaterThan(0);
    expect(order.isExpired).toBe(false);

    // 3. Buyer 1 views order details via GET /orders/:id
    const getRes = await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set('Cookie', buyer1Cookie)
      .expect(200);

    expect(getRes.body.id).toBe(order.id);
    expect(getRes.body.totalAmount).toBe(800000);
    expect(getRes.body.event.name).toBe('Đêm Hòa Nhạc Giao Hưởng');
    expect(getRes.body.event.location).toBe('Nhà hát Hòa Bình');
    expect(getRes.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seatId: seat1Id,
          tierName: 'VIP',
          unitPrice: 500000,
          label: 'A-1',
        }),
        expect.objectContaining({
          seatId: seat2Id,
          tierName: 'Standard',
          unitPrice: 300000,
          label: 'A-2',
        }),
      ]),
    );
  });

  it('AC 4: rejects access for unauthenticated user (401) and different user (404)', async () => {
    // Create an order for buyer 1
    const order = await db.order.create({
      data: {
        userId: buyer1Id,
        eventId,
        showtimeId,
        status: OrderStatus.PENDING,
        totalAmount: 500000,
        expiresAt: new Date(Date.now() + 600000),
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: [{ seatId: seat1Id, tierName: 'VIP', categoryName: 'VIP', unitPrice: 500000 }],
        },
      },
    });

    // Unauthenticated request
    await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .expect(401);

    // Buyer 2 attempting to view Buyer 1's order -> 404 (do not leak existence)
    await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set('Cookie', buyer2Cookie)
      .expect(404);
  });

  it('AC 3: marks expired order as EXPIRED and isExpired=true', async () => {
    // Create an expired order directly in DB
    const expiredOrder = await db.order.create({
      data: {
        userId: buyer1Id,
        eventId,
        showtimeId,
        status: OrderStatus.PENDING,
        totalAmount: 300000,
        expiresAt: new Date(Date.now() - 5000), // expired 5 seconds ago
        paymentExpiresAt: new Date(Date.now() - 5000),
        items: {
          create: [{ seatId: seat2Id, tierName: 'Standard', categoryName: 'Standard', unitPrice: 300000 }],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/orders/${expiredOrder.id}`)
      .set('Cookie', buyer1Cookie)
      .expect(200);

    expect(res.body.isExpired).toBe(true);
    expect(res.body.status).toBe(OrderStatus.EXPIRED);
    expect(res.body.remainingSeconds).toBe(0);
  });

  describe('S-22 Lightweight Order Status API', () => {
    it('returns status, latestPayment, and Cache-Control: no-store without side effects', async () => {
      const order = await db.order.create({
        data: {
          userId: buyer1Id,
          eventId,
          showtimeId,
          status: OrderStatus.PENDING,
          totalAmount: 500000,
          expiresAt: new Date(Date.now() + 600000),
          paymentExpiresAt: new Date(Date.now() + 600000),
          items: {
            create: [{ seatId: seat1Id, tierName: 'VIP', categoryName: 'VIP', unitPrice: 500000 }],
          },
          payments: {
            create: [
              {
                amount: 500000,
                status: 'INITIATED',
                gateway: 'mock',
                gatewayRef: `mock_ref_${Date.now()}`,
              },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/orders/${order.id}/status`)
        .set('Cookie', buyer1Cookie)
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.orderId).toBe(order.id);
      expect(res.body.status).toBe(OrderStatus.PENDING);
      expect(res.body.expiresAt).toBeTruthy();
      expect(res.body.serverTime).toBeTruthy();
      expect(res.body.latestPayment).not.toBeNull();
      expect(res.body.latestPayment.status).toBe('INITIATED');
      expect(res.body.latestPayment.attemptNo).toBe(1);

      // Verify no side effects: DB order status remains unchanged
      const freshOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(freshOrder.status).toBe(OrderStatus.PENDING);

      // Verify detail API also exposes latestPayment (S-22 requirement for S-24 compatibility)
      const detailRes = await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set('Cookie', buyer1Cookie)
        .expect(200);
      expect(detailRes.body.latestPayment).not.toBeNull();
      expect(detailRes.body.latestPayment.status).toBe('INITIATED');
      expect(detailRes.body.latestPayment.attemptNo).toBe(1);
    });

    it('rejects unauthenticated user (401) and different user (404) on status endpoint', async () => {
      const order = await db.order.create({
        data: {
          userId: buyer1Id,
          eventId,
          showtimeId,
          status: OrderStatus.PENDING,
          totalAmount: 500000,
          expiresAt: new Date(Date.now() + 600000),
          paymentExpiresAt: new Date(Date.now() + 600000),
          items: {
            create: [{ seatId: seat1Id, tierName: 'VIP', categoryName: 'VIP', unitPrice: 500000 }],
          },
        },
      });

      // 401 unauthenticated
      await request(app.getHttpServer())
        .get(`/orders/${order.id}/status`)
        .expect(401);

      // 404 different buyer
      await request(app.getHttpServer())
        .get(`/orders/${order.id}/status`)
        .set('Cookie', buyer2Cookie)
        .expect(404);
    });
  });

  describe('S-23 Order Expiry & Seat Release E2E', () => {
    it('AC 1 & AC 4: expires overdue order, deletes seat holds, leaves seat unsold, and is idempotent', async () => {
      const ordersService = app.get(OrdersService);
      const pastTime = new Date(Date.now() - 60000);

      // Create a seat for this test
      const testSeat = await db.seat.create({
        data: {
          showtimeId,
          categoryId: (await db.seatCategory.findFirstOrThrow({ where: { showtimeId } })).id,
          row: 'X',
          seatNumber: 99,
          isSold: false,
        },
      });

      // Create a hold session and seat_hold
      const holdSession = await db.holdSession.create({
        data: {
          showtimeId,
          userId: buyer1Id,
          sessionHash: `hash-${randomUUID()}`,
          token: randomUUID(),
          expiresAt: pastTime,
          expectedSeatIds: [testSeat.id],
        },
      });

      await db.seatHold.create({
        data: {
          seatId: testSeat.id,
          showtimeId,
          holdSessionId: holdSession.id,
          token: holdSession.token,
          expiresAt: pastTime,
        },
      });

      // Create an overdue order referencing this hold
      const order = await db.order.create({
        data: {
          userId: buyer1Id,
          eventId,
          showtimeId,
          holdSessionId: holdSession.id,
          holdToken: holdSession.token,
          status: OrderStatus.PENDING,
          totalAmount: 500000,
          expiresAt: pastTime,
          paymentExpiresAt: pastTime,
          items: {
            create: [{ seatId: testSeat.id, tierName: 'VIP', categoryName: 'VIP', unitPrice: 500000 }],
          },
        },
      });

      // Verify hold exists before expiry
      const holdBefore = await db.seatHold.findUnique({ where: { seatId: testSeat.id } });
      expect(holdBefore).not.toBeNull();

      // Run expireOrder
      const result1 = await ordersService.expireOrder(order.id);
      expect(result1.status).toBe('expired');
      expect((result1 as any).releasedSeatsCount).toBe(1);

      // Verify DB state: order is EXPIRED
      const updatedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe(OrderStatus.EXPIRED);

      // Verify seatHold is DELETED (seat is released to available)
      const holdAfter = await db.seatHold.findUnique({ where: { seatId: testSeat.id } });
      expect(holdAfter).toBeNull();

      // Verify seat is NOT sold
      const seatAfter = await db.seat.findUniqueOrThrow({ where: { id: testSeat.id } });
      expect(seatAfter.isSold).toBe(false);

      // AC 4: Run 2nd and 3rd time: idempotent, skipped
      const result2 = await ordersService.expireOrder(order.id);
      expect(result2.status).toBe('skipped');

      const result3 = await ordersService.expireOrder(order.id);
      expect(result3.status).toBe('skipped');
    });

    it('AC 2: skips unexpired pending order and preserves seat holds', async () => {
      const ordersService = app.get(OrdersService);
      const futureTime = new Date(Date.now() + 600000);

      const testSeat = await db.seat.create({
        data: {
          showtimeId,
          categoryId: (await db.seatCategory.findFirstOrThrow({ where: { showtimeId } })).id,
          row: 'Y',
          seatNumber: 88,
          isSold: false,
        },
      });

      const holdSession = await db.holdSession.create({
        data: {
          showtimeId,
          userId: buyer1Id,
          sessionHash: `hash-${randomUUID()}`,
          token: randomUUID(),
          expiresAt: futureTime,
          expectedSeatIds: [testSeat.id],
        },
      });

      await db.seatHold.create({
        data: {
          seatId: testSeat.id,
          showtimeId,
          holdSessionId: holdSession.id,
          token: holdSession.token,
          expiresAt: futureTime,
        },
      });

      const order = await db.order.create({
        data: {
          userId: buyer1Id,
          eventId,
          showtimeId,
          holdSessionId: holdSession.id,
          holdToken: holdSession.token,
          status: OrderStatus.PENDING,
          totalAmount: 500000,
          expiresAt: futureTime,
          paymentExpiresAt: futureTime,
          items: {
            create: [{ seatId: testSeat.id, tierName: 'VIP', categoryName: 'VIP', unitPrice: 500000 }],
          },
        },
      });

      const result = await ordersService.expireOrder(order.id);
      expect(result.status).toBe('skipped');

      // Order remains PENDING
      const orderDb = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(orderDb.status).toBe(OrderStatus.PENDING);

      // Hold is preserved
      const holdDb = await db.seatHold.findUnique({ where: { seatId: testSeat.id } });
      expect(holdDb).not.toBeNull();
    });
  });
});

