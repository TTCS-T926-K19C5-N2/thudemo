import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { buildMomoSignature } from '../src/payments/gateways/momo-signature.js';
import { decodeTicketKey } from '../src/tickets/ticket-signing-keys.js';
import { verifyTicketQr } from '../src/tickets/ticket-qr.js';

describe('Tickets S-25 / S-26 E2E Integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let showtimeId: string;
  let categoryId: string;
  let eventId: string;
  const userIds: string[] = [];
  let buyer: { id: string; cookie: string };
  let otherBuyer: { id: string; cookie: string };
  let organizer: { id: string; cookie: string };

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
        email: `${randomUUID()}@s25-e2e.test`,
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

  async function createPendingOrder(seatNumbers: number[]) {
    const seats = await Promise.all(
      seatNumbers.map((seatNumber) =>
        db.seat.create({ data: { showtimeId, categoryId, row: 'T', seatNumber } }),
      ),
    );
    const expiresAt = new Date(Date.now() + 600000);
    const order = await db.order.create({
      data: {
        userId: buyer.id,
        showtimeId,
        status: OrderStatus.PENDING_PAYMENT,
        paymentExpiresAt: expiresAt,
        expiresAt,
        totalAmount: 250000 * seats.length,
        items: {
          create: seats.map((seat) => ({
            seatId: seat.id,
            categoryName: 'STANDARD',
            unitPrice: 250000,
          })),
        },
      },
    });
    const gatewayRef = `${order.id}_${Date.now()}`;
    await db.payment.create({
      data: {
        orderId: order.id,
        amount: order.totalAmount,
        status: PaymentStatus.INITIATED,
        gateway: 'momo',
        gatewayRef,
      },
    });
    return { order, seats, gatewayRef };
  }

  function signedWebhook(orderId: string, gatewayRef: string, amount: number) {
    const payload: Record<string, unknown> = {
      partnerCode: 'MOMO',
      orderId: gatewayRef,
      requestId: gatewayRef,
      amount,
      orderInfo: `Thanh toan don hang ${orderId}`,
      orderType: 'momo_wallet',
      transId: `momo_s25_${Date.now()}`,
      resultCode: 0,
      message: 'Giao dich thanh cong.',
      payType: 'qr',
      responseTime: Date.now(),
      extraData: Buffer.from(JSON.stringify({ orderId })).toString('base64'),
    };
    payload.signature = buildMomoSignature(payload, momoAccessKey, momoSecretKey);
    return payload;
  }

  async function scannerKeys() {
    const res = await request(app.getHttpServer()).get('/tickets/public-keys').expect(200);
    return new Map<string, ReturnType<typeof decodeTicketKey>>(
      res.body.keys.map((k: { keyId: string; publicKey: string }) => [
        k.keyId,
        decodeTicketKey(k.publicKey, 'public'),
      ]),
    );
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);

    organizer = await createAccount('ORGANIZER');
    buyer = await createAccount('BUYER');
    otherBuyer = await createAccount('BUYER');

    const event = await db.event.create({
      data: {
        name: 'S25 Ticket Event',
        description: 'Signed ticket QR',
        location: 'Hà Nội',
        organizerId: organizer.id,
        status: 'PUBLISHED',
      },
    });
    eventId = event.id;
    const showtime = await db.showtime.create({
      data: { eventId, startTime: new Date('2026-12-01T12:00:00Z'), status: 'ON_SALE' },
    });
    showtimeId = showtime.id;
    const category = await db.seatCategory.create({
      data: { showtimeId, name: 'STANDARD', price: 250000 },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    if (db && showtimeId) {
      // Only fixtures created here; tickets cascade with orders/showtime.
      await db.payment.deleteMany({ where: { order: { showtimeId } } });
      await db.orderLog.deleteMany({ where: { order: { showtimeId } } });
      await db.orderItem.deleteMany({ where: { order: { showtimeId } } });
      await db.order.deleteMany({ where: { showtimeId } });
      await db.seat.deleteMany({ where: { showtimeId } });
      await db.seatCategory.deleteMany({ where: { showtimeId } });
      await db.showtime.deleteMany({ where: { id: showtimeId } });
      await db.event.deleteMany({ where: { id: eventId } });
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  it('issues exactly one signed ticket per seat when the order becomes PAID, even with replayed webhooks', async () => {
    const { order, seats, gatewayRef } = await createPendingOrder([1, 2]);
    const webhook = signedWebhook(order.id, gatewayRef, order.totalAmount);

    await Promise.all([
      request(app.getHttpServer()).post('/payments/webhook').send(webhook).expect(200),
      request(app.getHttpServer()).post('/payments/webhook').send(webhook).expect(200),
    ]);
    await request(app.getHttpServer()).post('/payments/webhook').send(webhook).expect(200);

    const tickets = await db.ticket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((t) => t.seatId))).toEqual(new Set(seats.map((s) => s.id)));
    expect(new Set(tickets.map((t) => t.code)).size).toBe(2);
    for (const ticket of tickets) {
      expect(ticket.keyId).toBeTruthy();
      expect(ticket.signature).toBeTruthy();
    }
  });

  it('lets only the owner read the tickets, with QR codes that verify offline and reject tampering', async () => {
    const { order, gatewayRef } = await createPendingOrder([3]);

    const before = await request(app.getHttpServer())
      .get(`/orders/${order.id}/tickets`)
      .set('Cookie', buyer.cookie)
      .expect(200);
    expect(before.body).toEqual({ tickets: [] });

    await request(app.getHttpServer())
      .post('/payments/webhook')
      .send(signedWebhook(order.id, gatewayRef, order.totalAmount))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/orders/${order.id}/tickets`)
      .set('Cookie', otherBuyer.cookie)
      .expect(404);

    const res = await request(app.getHttpServer())
      .get(`/orders/${order.id}/tickets`)
      .set('Cookie', buyer.cookie)
      .expect(200);
    expect(res.body.tickets).toHaveLength(1);
    const [ticket] = res.body.tickets;
    expect(ticket).toMatchObject({ seatLabel: 'T-3', status: 'VALID' });

    const keys = await scannerKeys();
    expect(verifyTicketQr(ticket.qrPayload, keys)).toMatchObject({
      valid: true,
      ticket: { code: ticket.code, showtimeId },
    });
    const tampered = ticket.qrPayload.replace(ticket.code, `${ticket.code.slice(0, -1)}X`);
    expect(verifyTicketQr(tampered, keys).valid).toBe(false);
  });

  it('gives the scanner the issued tickets together with the signing keys', async () => {
    const res = await request(app.getHttpServer())
      .get(`/scanner/showtimes/${showtimeId}/tickets`)
      .set('Cookie', organizer.cookie)
      .expect(200);

    const issued = await db.ticket.findMany({ where: { showtimeId } });
    expect(res.body.tickets.map((t: { code: string }) => t.code).sort()).toEqual(
      issued.map((t) => t.code).sort(),
    );
    const keyIds = res.body.publicKeys.map((k: { keyId: string }) => k.keyId);
    for (const ticket of issued) expect(keyIds).toContain(ticket.keyId);
  });
});
