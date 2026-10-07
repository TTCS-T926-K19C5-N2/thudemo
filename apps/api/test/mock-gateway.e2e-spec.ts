import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { HoldsService } from '../src/holds/holds.service.js';
import { validatePaymentGatewayConfig } from '../src/payments/payments-config.validator.js';

describe('Mock Gateway S-19 E2E Integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let buyerCookie: string;
  let buyerId: string;
  let showtimeId: string;
  let seat1Id: string;
  let seat2Id: string;
  let previousGatewayEnv: string | undefined;

  async function createAccount(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@mock-gateway-e2e.test`,
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
    previousGatewayEnv = process.env.PAYMENT_GATEWAY;
    process.env.PAYMENT_GATEWAY = 'mock';

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
    const server = await app.listen(0);
    const address = server.address() as any;
    process.env.API_INTERNAL_URL = `http://127.0.0.1:${address.port}`;

    db = app.get(PrismaService);

    const organizer = await createAccount('ORGANIZER');
    const buyer = await createAccount('BUYER');

    buyerId = buyer.id;
    buyerCookie = buyer.cookie;

    // Create event and showtime
    const event = await db.event.create({
      data: {
        name: 'Đêm diễn Mock Gateway S19',
        description: 'Test sự kiện cho cổng thanh toán giả lập',
        location: 'Nhà hát Hoà Bình',
        organizerId: organizer.id,
        status: 'PUBLISHED',
      },
    });

    const showtime = await db.showtime.create({
      data: {
        eventId: event.id,
        startTime: new Date('2026-12-01T19:00:00Z'),
        status: 'ON_SALE',
      },
    });
    showtimeId = showtime.id;

    // Create seat category
    const cat = await db.seatCategory.create({
      data: {
        showtimeId: showtime.id,
        name: 'Standard',
        price: 200000,
      },
    });

    // Create seats
    const s1 = await db.seat.create({
      data: {
        showtimeId: showtime.id,
        categoryId: cat.id,
        row: 'M',
        seatNumber: 1,
      },
    });
    seat1Id = s1.id;

    const s2 = await db.seat.create({
      data: {
        showtimeId: showtime.id,
        categoryId: cat.id,
        row: 'M',
        seatNumber: 2,
      },
    });
    seat2Id = s2.id;
  });

  afterAll(async () => {
    process.env.PAYMENT_GATEWAY = previousGatewayEnv;
    delete process.env.API_INTERNAL_URL;
    if (db) {
      await db.payment.deleteMany();
      await db.orderItem.deleteMany();
      await db.order.deleteMany();
      await db.seatHold.deleteMany();
      await db.holdSession.deleteMany();
      await db.seat.deleteMany();
      await db.seatCategory.deleteMany();
      await db.showtime.deleteMany();
      await db.event.deleteMany();
    }
    if (app) {
      await app.close();
    }
  });

  it('AC 1: Initiates payment with mock gateway returning internal /mock-gateway/pay redirectUrl', async () => {
    const token = randomUUID();
    const holdSession = await db.holdSession.create({
      data: {
        showtime: { connect: { id: showtimeId } },
        user: { connect: { id: buyerId } },
        sessionHash: `hash_${randomUUID()}`,
        token,
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    await db.seatHold.create({
      data: {
        seatId: seat1Id,
        showtimeId,
        holdSessionId: holdSession.id,
        token,
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    // 2. Create pending order
    const order = await db.order.create({
      data: {
        userId: buyerId,
        showtimeId,
        holdSessionId: holdSession.id,
        holdToken: token,
        status: OrderStatus.PENDING,
        totalAmount: 200000,
        expiresAt: new Date(Date.now() + 600000),
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: [{ seatId: seat1Id, categoryName: 'Standard', tierName: 'Standard', unitPrice: 200000 }],
        },
      },
    });

    // 3. Initiate payment
    const res = await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`)
      .set('Cookie', buyerCookie)
      .expect(200);

    expect(res.body.redirectUrl).toContain('/mock-gateway/pay');
    expect(res.body.redirectUrl).toContain(`orderId=${order.id}`);
    expect(res.body.redirectUrl).toContain('amount=200000');
    expect(res.body.gatewayRef).toContain(order.id);
  });

  it('AC 2: Submitting SUCCESS outcome sends signed webhook and updates order to PAID, seat to SOLD, deletes hold', async () => {
    const token = randomUUID();
    const holdSession = await db.holdSession.create({
      data: {
        showtime: { connect: { id: showtimeId } },
        user: { connect: { id: buyerId } },
        sessionHash: `hash_${randomUUID()}`,
        token,
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    await db.seatHold.create({
      data: {
        seatId: seat2Id,
        showtimeId,
        holdSessionId: holdSession.id,
        token,
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    // 2. Create pending order
    const order = await db.order.create({
      data: {
        userId: buyerId,
        showtimeId,
        holdSessionId: holdSession.id,
        holdToken: token,
        status: OrderStatus.PENDING,
        totalAmount: 200000,
        expiresAt: new Date(Date.now() + 600000),
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: [{ seatId: seat2Id, categoryName: 'Standard', tierName: 'Standard', unitPrice: 200000 }],
        },
      },
    });

    // 3. Initiate payment
    const initRes = await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`)
      .set('Cookie', buyerCookie)
      .expect(200);

    const gatewayRef = initRes.body.gatewayRef;

    // 4. Submit SUCCESS from mock gateway
    const submitRes = await request(app.getHttpServer())
      .post('/mock-gateway/submit')
      .send({
        orderId: order.id,
        amount: 200000,
        gatewayRef,
        returnUrl: `/payment/result?orderId=${order.id}`,
        outcome: 'SUCCESS',
      })
      .expect(200);

    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.status).toBe('SUCCESS');

    // 5. Verify database changes:
    // (a) Order is now PAID
    const updatedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe(OrderStatus.PAID);

    // (b) Seat is marked SOLD
    const updatedSeat = await db.seat.findUniqueOrThrow({ where: { id: seat2Id } });
    expect(updatedSeat.isSold).toBe(true);

    // (c) Seat hold is deleted
    const remainingHold = await db.seatHold.findUnique({ where: { seatId: seat2Id } });
    expect(remainingHold).toBeNull();

    // (d) Payment is SUCCEEDED
    const payment = await db.payment.findFirst({ where: { gatewayRef } });
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe(PaymentStatus.SUCCEEDED);
  });

  it('AC 3: Submitting FAILED outcome marks payment FAILED and leaves order PENDING', async () => {
    // 1. Create a seat for failure test
    const cat = await db.seatCategory.findFirstOrThrow({ where: { showtimeId } });
    const sFail = await db.seat.create({
      data: {
        showtimeId,
        categoryId: cat.id,
        row: 'M',
        seatNumber: 99,
      },
    });

    const token = randomUUID();
    const holdSession = await db.holdSession.create({
      data: {
        showtime: { connect: { id: showtimeId } },
        user: { connect: { id: buyerId } },
        sessionHash: `hash_${randomUUID()}`,
        token,
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    await db.seatHold.create({
      data: {
        seatId: sFail.id,
        showtimeId,
        holdSessionId: holdSession.id,
        token,
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    const order = await db.order.create({
      data: {
        userId: buyerId,
        showtimeId,
        holdSessionId: holdSession.id,
        holdToken: token,
        status: OrderStatus.PENDING,
        totalAmount: 200000,
        expiresAt: new Date(Date.now() + 600000),
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: [{ seatId: sFail.id, categoryName: 'Standard', tierName: 'Standard', unitPrice: 200000 }],
        },
      },
    });

    const initRes = await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`)
      .set('Cookie', buyerCookie)
      .expect(200);

    const gatewayRef = initRes.body.gatewayRef;

    // Submit FAILED outcome
    const submitRes = await request(app.getHttpServer())
      .post('/mock-gateway/submit')
      .send({
        orderId: order.id,
        amount: 200000,
        gatewayRef,
        returnUrl: `/payment/result?orderId=${order.id}`,
        outcome: 'FAILED',
      })
      .expect(200);

    expect(submitRes.body.status).toBe('FAILED');

    // Verify order remains PENDING
    const updatedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe(OrderStatus.PENDING);

    // Verify payment record is marked FAILED
    const payment = await db.payment.findFirst({ where: { gatewayRef } });
    expect(payment?.status).toBe(PaymentStatus.FAILED);
  });

  it('AC 4: Production guard prevents startup with mock gateway', () => {
    expect(() =>
      validatePaymentGatewayConfig({
        NODE_ENV: 'production',
        PAYMENT_GATEWAY: 'mock',
      }),
    ).toThrow(/Cổng thanh toán giả lập/);
  });

  it('AC 5: /mock-gateway/status returns enabled: true when mock gateway is configured', async () => {
    const res = await request(app.getHttpServer())
      .get('/mock-gateway/status')
      .expect(200);

    expect(res.body.enabled).toBe(true);
    expect(res.body.gateway).toBe('mock');
  });
});
