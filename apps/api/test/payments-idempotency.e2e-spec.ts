import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { buildMomoSignature } from '../src/payments/gateways/momo-signature.js';
import { AccountantNotifier } from '../src/payments/accountant-notifier.js';

describe('Payments S-20 Idempotency & Concurrency E2E Integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let accountantNotifier: AccountantNotifier;
  let buyerCookie: string;
  let buyerId: string;
  let showtimeId: string;
  let seatCatId: string;

  const momoAccessKey = process.env.MOMO_ACCESS_KEY ?? 'F8BBA842ECF85';
  const momoSecretKey =
    process.env.MOMO_SECRET_KEY ??
    process.env.PAYMENT_WEBHOOK_SECRET ??
    'K951B6PE1waDMi640xX08PD3vg6EkVlz';

  async function createAccount(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@s20-e2e.test`,
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

  async function createTestSeat(row: string, seatNumber: number) {
    return db.seat.create({
      data: {
        showtimeId,
        categoryId: seatCatId,
        row,
        seatNumber,
      },
    });
  }

  async function createOrderWithSeat(seat: { id: string }, expired = false) {
    const expiresAt = expired
      ? new Date(Date.now() - 60000)
      : new Date(Date.now() + 600000);

    const order = await db.order.create({
      data: {
        userId: buyerId,
        showtimeId,
        status: OrderStatus.PENDING,
        paymentExpiresAt: expiresAt,
        expiresAt,
        totalAmount: 250000,
        items: {
          create: [
            {
              seatId: seat.id,
              categoryName: 'STANDARD',
              unitPrice: 250000,
            },
          ],
        },
      },
      include: { items: true },
    });

    const gatewayRef = `${order.id}_${Date.now()}`;
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        amount: 250000,
        status: PaymentStatus.INITIATED,
        gateway: 'momo',
        gatewayRef,
      },
    });

    return { order, payment, gatewayRef };
  }

  function signWebhook(orderId: string, gatewayRef: string, transId: string, amount = 250000) {
    const extraData = Buffer.from(JSON.stringify({ orderId })).toString('base64');
    const payload: Record<string, unknown> = {
      partnerCode: 'MOMO',
      orderId: gatewayRef,
      requestId: gatewayRef,
      amount,
      orderInfo: `Thanh toan don hang ${orderId}`,
      orderType: 'momo_wallet',
      transId,
      resultCode: 0,
      message: 'Giao dich thanh cong.',
      payType: 'qr',
      responseTime: Date.now(),
      extraData,
    };
    payload.signature = buildMomoSignature(payload, momoAccessKey, momoSecretKey);
    return payload;
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
    accountantNotifier = app.get(AccountantNotifier);

    const organizer = await createAccount('ORGANIZER');
    const buyer = await createAccount('BUYER');
    buyerId = buyer.id;
    buyerCookie = buyer.cookie;

    const event = await db.event.create({
      data: {
        name: 'S20 Idempotency Event',
        description: 'Testing duplicate webhooks and concurrency',
        location: 'Hà Nội',
        organizerId: organizer.id,
        status: 'PUBLISHED',
      },
    });

    const showtime = await db.showtime.create({
      data: {
        eventId: event.id,
        startTime: new Date('2026-11-20T20:00:00Z'),
        status: 'ON_SALE',
      },
    });
    showtimeId = showtime.id;

    const cat = await db.seatCategory.create({
      data: {
        showtimeId: showtime.id,
        name: 'STANDARD',
        price: 250000,
      },
    });
    seatCatId = cat.id;
  });

  afterAll(async () => {
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
    await app.close();
  });

  it('AC 1: Re-sending the same webhook 5 times sequentially records exactly one payment and modifies status once', async () => {
    const seat = await createTestSeat('B', 1);
    const { order, gatewayRef } = await createOrderWithSeat(seat);

    const transId = `momo_trans_${Date.now()}`;
    const webhookPayload = signWebhook(order.id, gatewayRef, transId, 250000);

    // Send 5 times sequentially
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/payments/webhook')
        .send(webhookPayload)
        .expect(200);

      expect(res.body).toEqual({ received: true, status: 'PAID' });
    }

    // Verify DB state
    const payments = await db.payment.findMany({
      where: { orderId: order.id },
    });
    expect(payments.length).toBe(1);
    expect(payments[0].status).toBe(PaymentStatus.SUCCEEDED);
    expect(payments[0].transactionId).toBe(transId);

    const updatedOrder = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.PAID);

    const updatedSeat = await db.seat.findUniqueOrThrow({
      where: { id: seat.id },
    });
    expect(updatedSeat.isSold).toBe(true);
  });

  it('AC 2: Two concurrent webhook copies (via Promise.all) process safely without 500 errors', async () => {
    // Run multiple iterations to ensure concurrency resilience
    for (let iteration = 0; iteration < 3; iteration++) {
      const seat = await createTestSeat('C', iteration + 1);
      const { order, gatewayRef } = await createOrderWithSeat(seat);

      const transId = `momo_trans_concurrent_${iteration}_${Date.now()}`;
      const webhookPayload = signWebhook(order.id, gatewayRef, transId, 250000);

      // Fire 2 concurrent requests
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer()).post('/payments/webhook').send(webhookPayload),
        request(app.getHttpServer()).post('/payments/webhook').send(webhookPayload),
      ]);

      // Neither must return 500
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.body).toEqual({ received: true, status: 'PAID' });
      expect(resB.body).toEqual({ received: true, status: 'PAID' });

      // DB check: exactly one payment record, succeeded
      const payments = await db.payment.findMany({
        where: { orderId: order.id },
      });
      expect(payments.length).toBe(1);
      expect(payments[0].status).toBe(PaymentStatus.SUCCEEDED);

      const updatedOrder = await db.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(updatedOrder.status).toBe(OrderStatus.PAID);

      const updatedSeat = await db.seat.findUniqueOrThrow({
        where: { id: seat.id },
      });
      expect(updatedSeat.isSold).toBe(true);
    }
  });

  it('AC 3: Webhook for expired order marks LATE, leaves seats untouched, flags NEEDS_REVIEW and alerts accountant', async () => {
    const notifyLateSpy = vi.spyOn(accountantNotifier, 'notifyLatePayment');
    const seat = await createTestSeat('D', 1);
    const { order, gatewayRef } = await createOrderWithSeat(seat, true); // Expired order

    const transId = `momo_trans_late_${Date.now()}`;
    const webhookPayload = signWebhook(order.id, gatewayRef, transId, 250000);

    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send(webhookPayload)
      .expect(200);

    expect(res.body).toEqual({ received: true, status: 'LATE' });

    // DB checks:
    // Order must NOT be PAID, must be NEEDS_REVIEW
    const updatedOrder = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.NEEDS_REVIEW);

    // Seat must NOT be sold
    const updatedSeat = await db.seat.findUniqueOrThrow({
      where: { id: seat.id },
    });
    expect(updatedSeat.isSold).toBe(false);

    // Payment must be LATE
    const payments = await db.payment.findMany({
      where: { orderId: order.id },
    });
    expect(payments.length).toBe(1);
    expect(payments[0].status).toBe(PaymentStatus.LATE);
    expect(payments[0].transactionId).toBe(transId);

    // AccountantNotifier must be alerted
    expect(notifyLateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: order.id,
        amount: 250000,
        transactionId: transId,
      }),
    );
  });

  it('AC 4: Webhook arrives before user returns to result page: user immediately sees PAID order', async () => {
    const seat = await createTestSeat('E', 1);
    const { order, gatewayRef } = await createOrderWithSeat(seat);

    // 1. Webhook arrives and completes first
    const transId = `momo_trans_before_return_${Date.now()}`;
    const webhookPayload = signWebhook(order.id, gatewayRef, transId, 250000);

    await request(app.getHttpServer())
      .post('/payments/webhook')
      .send(webhookPayload)
      .expect(200);

    // 2. User then redirects to result page and queries GET /orders/:id
    const orderRes = await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set('Cookie', buyerCookie)
      .expect(200);

    expect(orderRes.body.status).toBe('PAID');
    expect(orderRes.body.isExpired).toBe(false);
  });
});
