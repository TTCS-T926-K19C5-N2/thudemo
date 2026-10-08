import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { buildMomoSignature } from '../src/payments/gateways/momo-signature.js';
import { HoldsService } from '../src/holds/holds.service.js';

describe('Payments S-18 E2E Integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let holdsService: HoldsService;
  let buyer1Cookie: string;
  let buyer1Id: string;
  let buyer2Cookie: string;
  let showtimeId: string;
  let seat1Id: string;
  let seat2Id: string;
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
        email: `${randomUUID()}@payment-e2e.test`,
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

  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (
      target.hostname !== '127.0.0.1' ||
      (target.port !== '15432' &&
        (target.port !== '15434' ||
          process.env.S32_ISOLATED_TEST !== 'true')) ||
      target.pathname !== '/sprint2_integration'
    ) {
      throw new Error('Run only on the isolated sprint2_integration database');
    }

    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      if (typeof url === 'string' && url.includes('momo.vn')) {
        return {
          ok: true,
          json: async () => ({
            payUrl: 'https://test-payment.momo.vn/gw_payment/pay',
            resultCode: 0,
          }),
        } as any;
      }
      return originalFetch(url, init);
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    holdsService = app.get(HoldsService);

    const organizer = await createAccount('ORGANIZER');
    const b1 = await createAccount('BUYER');
    const b2 = await createAccount('BUYER');

    buyer1Id = b1.id;
    buyer1Cookie = b1.cookie;
    buyer2Cookie = b2.cookie;

    // Create event and showtime
    const event = await db.event.create({
      data: {
        name: 'Nhạc Kịch Broadway S18',
        description: 'Đêm diễn đặc biệt',
        location: 'Nhà hát Lớn Hà Nội',
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

    // Create seat category
    const catVip = await db.seatCategory.create({
      data: {
        showtimeId: showtime.id,
        name: 'VIP',
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
    seat1Id = s1.id;

    const s2 = await db.seat.create({
      data: {
        showtimeId: showtime.id,
        categoryId: catVip.id,
        row: 'A',
        seatNumber: 2,
      },
    });
    seat2Id = s2.id;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
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

  it('AC 1 & AC 2: Initiates payment for pending order, rejects if wrong user or expired', async () => {
    // 1. Create a valid pending order for buyer 1
    const order = await db.order.create({
      data: {
        userId: buyer1Id,
        eventId: (
          await db.showtime.findUniqueOrThrow({ where: { id: showtimeId } })
        ).eventId,
        showtimeId,
        status: OrderStatus.PENDING,
        totalAmount: 300000,
        expiresAt: new Date(Date.now() + 600000), // 10 minutes from now
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: [
            {
              seatId: seat1Id,
              tierName: 'VIP',
              categoryName: 'VIP',
              unitPrice: 300000,
            },
          ],
        },
      },
    });

    // AC 2: Other user tries to initiate payment -> 404
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`)
      .set('Cookie', buyer2Cookie)
      .expect(404);

    // AC 1: Valid buyer initiates payment -> 200 with redirectUrl and gatewayRef
    const res = await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`)
      .set('Cookie', buyer1Cookie)
      .send({ returnUrl: 'http://localhost:3000/payment/result' })
      .expect(200);

    expect(res.body.redirectUrl).toBeTruthy();
    expect(res.body.gatewayRef).toContain(order.id);

    // Verify Payment record in DB is INITIATED
    const payment = await db.payment.findFirst({
      where: { orderId: order.id },
    });
    expect(payment).toBeTruthy();
    expect(payment?.status).toBe(PaymentStatus.INITIATED);
    expect(payment?.amount).toBe(300000);

    // AC 2: Expired order cannot initiate payment
    const expiredOrder = await db.order.create({
      data: {
        userId: buyer1Id,
        eventId: (
          await db.showtime.findUniqueOrThrow({ where: { id: showtimeId } })
        ).eventId,
        showtimeId,
        status: OrderStatus.PENDING,
        totalAmount: 300000,
        expiresAt: new Date(Date.now() - 5000), // Expired
        paymentExpiresAt: new Date(Date.now() - 5000),
        items: {
          create: [
            {
              seatId: seat1Id,
              tierName: 'VIP',
              categoryName: 'VIP',
              unitPrice: 300000,
            },
          ],
        },
      },
    });

    await request(app.getHttpServer())
      .post(`/orders/${expiredOrder.id}/pay`)
      .set('Cookie', buyer1Cookie)
      .expect(400);
  });

  it('AC 3 & AC 4: Webhook with valid signature and matching amount updates order to PAID, seats to SOLD, deletes holds, payment to SUCCEEDED', async () => {
    // Create hold session and hold for seat 2
    const token = randomUUID();
    const holdSession = await db.holdSession.create({
      data: {
        showtimeId,
        userId: buyer1Id,
        sessionHash: 'test_hash',
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

    // Create order
    const order = await db.order.create({
      data: {
        userId: buyer1Id,
        eventId: (
          await db.showtime.findUniqueOrThrow({ where: { id: showtimeId } })
        ).eventId,
        showtimeId,
        status: OrderStatus.PENDING,
        totalAmount: 300000,
        expiresAt: new Date(Date.now() + 600000),
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: [
            {
              seatId: seat2Id,
              tierName: 'VIP',
              categoryName: 'VIP',
              unitPrice: 300000,
            },
          ],
        },
      },
    });

    // Initiate payment
    const initRes = await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`)
      .set('Cookie', buyer1Cookie)
      .expect(200);

    const gatewayRef = initRes.body.gatewayRef;

    // Simulate MoMo IPN webhook payload
    const extraData = Buffer.from(
      JSON.stringify({ orderId: order.id }),
    ).toString('base64');
    const webhookPayload: Record<string, unknown> = {
      partnerCode: 'MOMO',
      orderId: gatewayRef,
      requestId: gatewayRef,
      amount: 300000,
      orderInfo: `Thanh toán đơn hàng ${order.id}`,
      orderType: 'momo_wallet',
      transId: '987654321',
      resultCode: 0,
      message: 'Giao dịch thành công.',
      payType: 'qr',
      responseTime: Date.now(),
      extraData,
    };

    const signature = buildMomoSignature(
      webhookPayload,
      momoAccessKey,
      momoSecretKey,
    );
    webhookPayload.signature = signature;

    // Send Webhook (public endpoint, buyer didn't return to browser yet - AC 4)
    const webhookRes = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send(webhookPayload)
      .expect(200);

    expect(webhookRes.body.status).toBe('PAID');

    // Verify all 4 changes committed in DB:
    // (a) Order -> PAID
    const updatedOrder = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.PAID);

    // (b) Seat -> isSold = true
    const updatedSeat = await db.seat.findUniqueOrThrow({
      where: { id: seat2Id },
    });
    expect(updatedSeat.isSold).toBe(true);

    // (c) SeatHold deleted
    const remainingHold = await db.seatHold.findUnique({
      where: { seatId: seat2Id },
    });
    expect(remainingHold).toBeNull();

    // (d) Payment -> SUCCEEDED with transactionId
    const updatedPayment = await db.payment.findFirst({
      where: { orderId: order.id },
    });
    expect(updatedPayment?.status).toBe(PaymentStatus.SUCCEEDED);
    expect(updatedPayment?.transactionId).toBe('987654321');
  });

  it('AC 5 & AC 7: Webhook with mismatched amount marks order NEEDS_REVIEW, payment AMOUNT_MISMATCH, and seat is excluded from expiry sweep', async () => {
    // Create new seat and hold
    const cat = await db.seatCategory.findFirstOrThrow({
      where: { showtimeId },
    });
    const seat = await db.seat.create({
      data: {
        showtimeId,
        categoryId: cat.id,
        row: 'B',
        seatNumber: 1,
      },
    });

    const token = randomUUID();
    const holdSession = await db.holdSession.create({
      data: {
        showtimeId,
        userId: buyer1Id,
        sessionHash: 'hash_mismatch',
        token,
        expiresAt: new Date(Date.now() - 1000), // Expired hold
      },
    });

    await db.seatHold.create({
      data: {
        seatId: seat.id,
        showtimeId,
        holdSessionId: holdSession.id,
        token,
        expiresAt: new Date(Date.now() - 1000), // Expired
      },
    });

    const order = await db.order.create({
      data: {
        userId: buyer1Id,
        eventId: (
          await db.showtime.findUniqueOrThrow({ where: { id: showtimeId } })
        ).eventId,
        showtimeId,
        status: OrderStatus.PENDING,
        totalAmount: 300000,
        expiresAt: new Date(Date.now() + 600000),
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: [
            {
              seatId: seat.id,
              tierName: 'VIP',
              categoryName: 'VIP',
              unitPrice: 300000,
            },
          ],
        },
      },
    });

    const gatewayRef = `${order.id}_mismatch_test`;
    const extraData = Buffer.from(
      JSON.stringify({ orderId: order.id }),
    ).toString('base64');
    const webhookPayload: Record<string, unknown> = {
      partnerCode: 'MOMO',
      orderId: gatewayRef,
      requestId: gatewayRef,
      amount: 150000, // MISMATCH! Expected 300000, received 150000
      orderInfo: 'Thanh toán đơn hàng',
      orderType: 'momo_wallet',
      transId: 'tx_mismatch_123',
      resultCode: 0,
      message: 'Giao dịch thành công.',
      payType: 'qr',
      responseTime: Date.now(),
      extraData,
    };

    const signature = buildMomoSignature(
      webhookPayload,
      momoAccessKey,
      momoSecretKey,
    );
    webhookPayload.signature = signature;

    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send(webhookPayload)
      .expect(200);

    expect(res.body.status).toBe('AMOUNT_MISMATCH');

    // Verify order is marked NEEDS_REVIEW, NOT PAID
    const updatedOrder = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.NEEDS_REVIEW);

    // Verify payment is AMOUNT_MISMATCH
    const payment = await db.payment.findFirst({
      where: { orderId: order.id },
    });
    expect(payment?.status).toBe(PaymentStatus.AMOUNT_MISMATCH);
    expect(payment?.amount).toBe(150000);

    // AC 7: Seat belonging to NEEDS_REVIEW order must be excluded from expiredBatch sweep!
    const expiredBatches = await holdsService.expiredBatch();
    const foundInExpiredBatch = expiredBatches.some(
      (b) => b.seatId === seat.id,
    );
    expect(foundInExpiredBatch).toBe(false);
  });

  it('AC 6: Webhook with FAILED result marks payment FAILED and leaves order PENDING', async () => {
    const cat = await db.seatCategory.findFirstOrThrow({
      where: { showtimeId },
    });
    const seat = await db.seat.create({
      data: {
        showtimeId,
        categoryId: cat.id,
        row: 'C',
        seatNumber: 1,
      },
    });

    const order = await db.order.create({
      data: {
        userId: buyer1Id,
        eventId: (
          await db.showtime.findUniqueOrThrow({ where: { id: showtimeId } })
        ).eventId,
        showtimeId,
        status: OrderStatus.PENDING,
        totalAmount: 300000,
        expiresAt: new Date(Date.now() + 600000),
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: [
            {
              seatId: seat.id,
              tierName: 'VIP',
              categoryName: 'VIP',
              unitPrice: 300000,
            },
          ],
        },
      },
    });

    const gatewayRef = `${order.id}_failed_test`;
    const extraData = Buffer.from(
      JSON.stringify({ orderId: order.id }),
    ).toString('base64');
    const webhookPayload: Record<string, unknown> = {
      partnerCode: 'MOMO',
      orderId: gatewayRef,
      requestId: gatewayRef,
      amount: 300000,
      orderInfo: 'Thanh toán đơn hàng',
      orderType: 'momo_wallet',
      transId: 'tx_failed_999',
      resultCode: 1006, // User cancelled or failed
      message: 'Giao dịch thất bại.',
      payType: 'qr',
      responseTime: Date.now(),
      extraData,
    };

    const signature = buildMomoSignature(
      webhookPayload,
      momoAccessKey,
      momoSecretKey,
    );
    webhookPayload.signature = signature;

    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send(webhookPayload)
      .expect(200);

    expect(res.body.status).toBe('FAILED');

    // Order remains PENDING so user can retry
    const currentOrder = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(currentOrder.status).toBe(OrderStatus.PENDING);

    // Payment is marked FAILED
    const payment = await db.payment.findFirst({
      where: { orderId: order.id },
    });
    expect(payment?.status).toBe(PaymentStatus.FAILED);
  });

  it('Security Check: DB has no credit card number columns', async () => {
    // Query column names of payments table from information_schema
    const columns = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payments'
    `;

    const columnNames = columns.map((c) => c.column_name.toLowerCase());
    expect(columnNames).not.toContain('cardnumber');
    expect(columnNames).not.toContain('card_number');
    expect(columnNames).not.toContain('cvv');
    expect(columnNames).not.toContain('cvc');
    expect(columnNames).toContain('transactionid');
    expect(columnNames).toContain('gatewayref');
  });
});
