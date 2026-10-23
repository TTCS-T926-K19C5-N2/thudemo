import { assertIntegrationDatabase } from './integration-database.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { HoldsService } from '../src/holds/holds.service.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../src/payments/gateways/payment-gateway.interface.js';
import { validatePaymentGatewayConfig } from '../src/payments/payments-config.validator.js';

describe('Mock Gateway S-19 E2E Integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let buyerCookie: string;
  let buyerId: string;
  let eventId: string;
  let showtimeId: string;
  let seat1Id: string;
  let seat2Id: string;
  let previousGatewayEnv: string | undefined;
  const userIds: string[] = [];
  const runMarker = process.env.AI_REMEDIATION_RUN_ID ?? randomUUID();

  async function createAccount(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        email: `${runMarker}.${randomUUID()}@mock-gateway-e2e.test`,
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

  async function cleanupEventFixture(targetEventId: string) {
    const showtimes = await db.showtime.findMany({ where: { eventId: targetEventId }, select: { id: true } });
    for (const showtime of showtimes) {
      await db.$transaction(async (tx) => {
        await tx.ticketLog.deleteMany({ where: { ticket: { showtimeId: showtime.id } } });
        await tx.ticketAdmission.deleteMany({ where: { showtimeId: showtime.id } });
        await tx.ticket.deleteMany({ where: { showtimeId: showtime.id } });
        await tx.ticketMailDelivery.deleteMany({ where: { order: { showtimeId: showtime.id } } });
        await tx.orderLog.deleteMany({ where: { order: { showtimeId: showtime.id } } });
        await tx.payment.deleteMany({ where: { order: { showtimeId: showtime.id } } });
        await tx.orderItem.deleteMany({ where: { order: { showtimeId: showtime.id } } });
        await tx.order.deleteMany({ where: { showtimeId: showtime.id } });
        await tx.seatHold.deleteMany({ where: { showtimeId: showtime.id } });
        await tx.holdSession.deleteMany({ where: { showtimeId: showtime.id } });
        await tx.seat.deleteMany({ where: { showtimeId: showtime.id } });
        await tx.seatCategory.deleteMany({ where: { showtimeId: showtime.id } });
        await tx.showtime.delete({ where: { id: showtime.id } });
      });
    }
    await db.event.deleteMany({ where: { id: targetEventId } });
  }

  beforeAll(async () => {
    previousGatewayEnv = process.env.PAYMENT_GATEWAY;
    process.env.PAYMENT_GATEWAY = 'mock';

    assertIntegrationDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const server = await app.listen(0);
    const address = server.address() as any;
    process.env.API_INTERNAL_URL = `http://127.0.0.1:${address.port}`;

    db = app.get(PrismaService);

    // Recover only leftover fixtures with this test's run marker from an
    // interrupted prior attempt; never clear unrelated rows in the profile.
    const staleEvents = await db.event.findMany({
      where: { name: `Đêm diễn Mock Gateway S19 ${runMarker}` },
      select: { id: true },
    });
    for (const stale of staleEvents) await cleanupEventFixture(stale.id);
    const staleUsers = await db.user.findMany({
      where: { email: { startsWith: `${runMarker}.`, endsWith: '@mock-gateway-e2e.test' } },
      select: { id: true },
    });
    if (staleUsers.length) {
      const staleUserIds = staleUsers.map((user) => user.id);
      await db.session.deleteMany({ where: { userId: { in: staleUserIds } } });
      await db.userRole.deleteMany({ where: { userId: { in: staleUserIds } } });
      await db.user.deleteMany({ where: { id: { in: staleUserIds } } });
    }

    const organizer = await createAccount('ORGANIZER');
    const buyer = await createAccount('BUYER');

    buyerId = buyer.id;
    buyerCookie = buyer.cookie;

    // Create event and showtime
    const event = await db.event.create({
      data: {
        name: `Đêm diễn Mock Gateway S19 ${runMarker}`,
        description: 'Test sự kiện cho cổng thanh toán giả lập',
        location: 'Nhà hát Hoà Bình',
        organizerId: organizer.id,
        status: 'PUBLISHED',
      },
    });
    eventId = event.id;

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
    if (db && eventId) {
      await cleanupEventFixture(eventId);
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      const cleanupOracle = {
        runId: runMarker,
        remainingEventRows: await db.event.count({ where: { id: eventId } }),
        remainingShowtimeRows: await db.showtime.count({ where: { id: showtimeId } }),
        remainingFixtureUsers: userIds.length
          ? await db.user.count({ where: { id: { in: userIds } } })
          : 0,
      };
      const manifestPath = process.env.AI_REMEDIATION_PROFILE_MANIFEST;
      if (manifestPath)
        writeFileSync(resolve(dirname(manifestPath), 'int02-fixture-cleanup.json'), JSON.stringify(cleanupOracle, null, 2));
      expect(cleanupOracle).toMatchObject({ remainingEventRows: 0, remainingShowtimeRows: 0, remainingFixtureUsers: 0 });
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
          create: [
            {
              seatId: seat1Id,
              categoryName: 'Standard',
              tierName: 'Standard',
              unitPrice: 200000,
            },
          ],
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
          create: [
            {
              seatId: seat2Id,
              categoryName: 'Standard',
              tierName: 'Standard',
              unitPrice: 200000,
            },
          ],
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
    const updatedOrder = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.PAID);

    // (b) Seat is marked SOLD
    const updatedSeat = await db.seat.findUniqueOrThrow({
      where: { id: seat2Id },
    });
    expect(updatedSeat.isSold).toBe(true);

    // (c) Seat hold is deleted
    const remainingHold = await db.seatHold.findUnique({
      where: { seatId: seat2Id },
    });
    expect(remainingHold).toBeNull();

    // (d) Payment is SUCCEEDED
    const payment = await db.payment.findFirst({ where: { gatewayRef } });
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe(PaymentStatus.SUCCEEDED);
  });

  it('AC 3: Submitting FAILED outcome marks payment FAILED and leaves order PENDING', async () => {
    // 1. Create a seat for failure test
    const cat = await db.seatCategory.findFirstOrThrow({
      where: { showtimeId },
    });
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
          create: [
            {
              seatId: sFail.id,
              categoryName: 'Standard',
              tierName: 'Standard',
              unitPrice: 200000,
            },
          ],
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
    const updatedOrder = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.PENDING);

    // Verify payment record is marked FAILED
    const payment = await db.payment.findFirst({ where: { gatewayRef } });
    expect(payment?.status).toBe(PaymentStatus.FAILED);
  });

  it('INT-02: retries one failed payment and webhook replay creates one paid ticket bundle and one mail job', async () => {
    const category = await db.seatCategory.findFirstOrThrow({ where: { showtimeId } });
    const seat = await db.seat.create({
      data: { showtimeId, categoryId: category.id, row: 'QA', seatNumber: 2_000_000 + Math.floor(Math.random() * 1_000_000) },
    });
    const holdToken = randomUUID();
    const holdSession = await db.holdSession.create({
      data: {
        showtimeId,
        userId: buyerId,
        sessionHash: `int02-${runMarker}-${randomUUID()}`,
        token: holdToken,
        expectedSeatIds: [seat.id],
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    await db.seatHold.create({
      data: { seatId: seat.id, showtimeId, holdSessionId: holdSession.id, token: holdToken, expiresAt: holdSession.expiresAt },
    });
    const order = await db.order.create({
      data: {
        userId: buyerId,
        eventId,
        showtimeId,
        holdSessionId: holdSession.id,
        holdToken,
        status: OrderStatus.PENDING,
        subtotalAmount: 200_000,
        totalAmount: 200_000,
        expiresAt: holdSession.expiresAt,
        paymentExpiresAt: holdSession.expiresAt,
        items: { create: { seatId: seat.id, categoryName: 'Standard', tierName: 'Standard', unitPrice: 200_000 } },
      },
    });

    const attemptOne = await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`).set('Cookie', buyerCookie).expect(200);
    await request(app.getHttpServer()).post('/mock-gateway/submit').send({
      orderId: order.id, amount: 200_000, gatewayRef: attemptOne.body.gatewayRef,
      returnUrl: `/payment/result?orderId=${order.id}`, outcome: 'FAILED',
    }).expect(200);
    expect((await db.payment.findUniqueOrThrow({ where: { gatewayRef: attemptOne.body.gatewayRef } })).status).toBe(PaymentStatus.FAILED);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PENDING);
    expect(await db.seatHold.count({ where: { seatId: seat.id } })).toBe(1);

    const attemptTwo = await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`).set('Cookie', buyerCookie).expect(200);
    expect(attemptTwo.body.gatewayRef).not.toBe(attemptOne.body.gatewayRef);
    expect(await db.order.count({ where: { id: order.id } })).toBe(1);
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(2);
    const secondPayment = await db.payment.findUniqueOrThrow({ where: { gatewayRef: attemptTwo.body.gatewayRef } });
    expect(secondPayment.attemptNo).toBe(2);

    const submit = () => request(app.getHttpServer()).post('/mock-gateway/submit').send({
      orderId: order.id, amount: 200_000, gatewayRef: attemptTwo.body.gatewayRef,
      returnUrl: `/payment/result?orderId=${order.id}`, outcome: 'SUCCESS',
    }).expect(200);
    await submit();
    await submit();

    const paidOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paidOrder.status).toBe(OrderStatus.PAID);
    expect(await db.seat.findUniqueOrThrow({ where: { id: seat.id } })).toMatchObject({ isSold: true });
    expect(await db.seatHold.count({ where: { seatId: seat.id } })).toBe(0);
    expect(await db.payment.count({ where: { orderId: order.id, status: PaymentStatus.SUCCEEDED } })).toBe(1);
    expect(await db.ticket.count({ where: { orderId: order.id, status: 'VALID' } })).toBe(1);
    expect(await db.ticketMailDelivery.count({ where: { orderId: order.id, dedupeKey: `paid:${order.id}` } })).toBe(1);
    const resultPage = await request(app.getHttpServer()).get(`/orders/${order.id}`).set('Cookie', buyerCookie).expect(200);
    expect(resultPage.body.status).toBe(OrderStatus.PAID);
    const tickets = await request(app.getHttpServer()).get('/tickets/me').set('Cookie', buyerCookie).expect(200);
    expect(tickets.body.tickets.filter((ticket: { orderId?: string; code: string }) => ticket.code && ticket.orderId === order.id)).toHaveLength(1);
    const paymentRows = await db.payment.findMany({ where: { orderId: order.id }, orderBy: { attemptNo: 'asc' } });
    const ticketRows = await db.ticket.findMany({ where: { orderId: order.id }, select: { id: true, seatId: true, status: true } });
    const mailJobs = await db.ticketMailDelivery.findMany({ where: { orderId: order.id }, select: { dedupeKey: true, status: true, attempts: true } });
    const manifestPath = process.env.AI_REMEDIATION_PROFILE_MANIFEST;
    if (manifestPath) {
      writeFileSync(resolve(dirname(manifestPath), 'int02-retry-payment-oracle.json'), JSON.stringify({
        runId: runMarker,
        fixture: { eventId, showtimeId, orderId: order.id, seatId: seat.id },
        stages: {
          failedAttempt: { gatewayRef: attemptOne.body.gatewayRef, paymentStatus: 'FAILED', orderStatusAfterFailure: 'PENDING', seatHeldAfterFailure: true },
          successfulRetry: { gatewayRef: attemptTwo.body.gatewayRef, attemptNo: secondPayment.attemptNo, finalOrderStatus: paidOrder.status },
          repeatedSuccessWebhookCount: 2,
        },
        oracle: {
          orderCount: await db.order.count({ where: { id: order.id } }),
          payments: paymentRows.map(({ attemptNo, status, amount }) => ({ attemptNo, status, amount })),
          soldSeat: (await db.seat.findUniqueOrThrow({ where: { id: seat.id } })).isSold,
          remainingHolds: await db.seatHold.count({ where: { seatId: seat.id } }),
          tickets: ticketRows,
          mailJobs,
          paidResultApiStatus: resultPage.status,
          buyerTicketCount: tickets.body.tickets.filter((ticket: { orderId?: string; code: string }) => ticket.code && ticket.orderId === order.id).length,
        },
      }, null, 2));
    }
  });

  it('INT-14: gateway transport failure leaves order and seat intact without issuing tickets', async () => {
    const category = await db.seatCategory.findFirstOrThrow({ where: { showtimeId } });
    const seat = await db.seat.create({
      data: { showtimeId, categoryId: category.id, row: 'IA', seatNumber: 2_100_000 + Math.floor(Math.random() * 1_000_000) },
    });
    const token = randomUUID();
    const holdSession = await db.holdSession.create({
      data: {
        showtimeId,
        userId: buyerId,
        sessionHash: `int14-${runMarker}-${randomUUID()}`,
        token,
        expectedSeatIds: [seat.id],
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    await db.seatHold.create({
      data: { seatId: seat.id, showtimeId, holdSessionId: holdSession.id, token, expiresAt: holdSession.expiresAt },
    });
    const order = await db.order.create({
      data: {
        userId: buyerId,
        eventId,
        showtimeId,
        holdSessionId: holdSession.id,
        holdToken: token,
        status: OrderStatus.PENDING,
        subtotalAmount: 200_000,
        totalAmount: 200_000,
        expiresAt: holdSession.expiresAt,
        paymentExpiresAt: holdSession.expiresAt,
        items: { create: { seatId: seat.id, categoryName: 'Standard', tierName: 'Standard', unitPrice: 200_000 } },
      },
    });

    const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
    const originalCreatePayment = gateway.createPayment;
    gateway.createPayment = async () => {
      throw new Error('INT-14 fixture transport failure; provider acceptance unknown');
    };
    try {
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/pay`)
        .set('Cookie', buyerCookie)
        .expect(502)
        .expect(({ body }) => expect(body.code).toBe('PAYMENT_OUTCOME_UNKNOWN'));
    } finally {
      gateway.createPayment = originalCreatePayment;
    }

    const [storedOrder, attempts, tickets, holds, storedSeat] = await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: order.id } }),
      db.payment.findMany({ where: { orderId: order.id } }),
      db.ticket.count({ where: { orderId: order.id } }),
      db.seatHold.count({ where: { seatId: seat.id } }),
      db.seat.findUniqueOrThrow({ where: { id: seat.id } }),
    ]);
    expect(storedOrder.status).toBe(OrderStatus.PENDING);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe(PaymentStatus.INITIATED);
    expect(tickets).toBe(0);
    expect(holds).toBe(1);
    expect(storedSeat.isSold).toBe(false);
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`)
      .set('Cookie', buyerCookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PAYMENT_RECONCILIATION_REQUIRED'));
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
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
