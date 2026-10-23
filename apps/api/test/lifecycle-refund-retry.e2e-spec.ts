import { assertIntegrationDatabase } from './integration-database.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { AppModule } from '../src/app.module.js';
import { CancellationsService } from '../src/lifecycle/cancellations.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('S48 mock refund retry and manual resolution', () => {
  let app: INestApplication;
  let db: PrismaService;
  let service: CancellationsService;
  let buyerCookie: string;
  let accountantCookie: string;
  let buyerId: string;
  let organizerId: string;
  let eventId: string;
  let showtimeId: string;
  let orderId: string;
  let seatId: string;
  const userIds: string[] = [];
  const originalRefundFailAttempts =
    process.env.MOCK_REFUND_FAIL_FIRST_ATTEMPTS;

  async function createAccount(role: 'BUYER' | 'ACCOUNTANT' | 'ORGANIZER') {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const roleRecord = await db.role.findUniqueOrThrow({
      where: { name: role },
    });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@s48-refund-e2e.test`,
        password: 'secure-test-password',
        isEmailVerified: true,
        userRoles: { create: { roleId: roleRecord.id } },
      },
    });
    userIds.push(user.id);
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  beforeAll(async () => {
    assertIntegrationDatabase();
    process.env.MOCK_REFUND_FAIL_FIRST_ATTEMPTS = '3';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    service = app.get(CancellationsService);

    const buyer = await createAccount('BUYER');
    const accountant = await createAccount('ACCOUNTANT');
    const organizer = await createAccount('ORGANIZER');
    buyerId = buyer.id;
    organizerId = organizer.id;
    buyerCookie = buyer.cookie;
    accountantCookie = accountant.cookie;

    const event = await db.event.create({
      data: {
        name: 'S48 mock refund retry',
        description: 'Run-bound isolated retry fixture',
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
    const category = await db.seatCategory.create({
      data: { showtimeId, name: 'Standard', price: 50_000 },
    });
    const seat = await db.seat.create({
      data: {
        showtimeId,
        categoryId: category.id,
        row: 'R',
        seatNumber: 1,
        isSold: true,
      },
    });
    seatId = seat.id;
    const order = await db.order.create({
      data: {
        userId: buyerId,
        eventId,
        showtimeId,
        status: 'PAID',
        totalAmount: 50_000,
        paymentExpiresAt: new Date(Date.now() + 600_000),
        expiresAt: new Date(Date.now() + 600_000),
        items: {
          create: {
            seatId,
            categoryName: 'Standard',
            unitPrice: 50_000,
          },
        },
      },
    });
    orderId = order.id;
    await db.payment.create({
      data: {
        orderId,
        amount: 50_000,
        status: 'SUCCEEDED',
        gateway: 'mock',
        gatewayRef: `s48-${randomUUID()}`,
      },
    });
  }, 30_000);

  afterAll(async () => {
    if (db && orderId) {
      const refunds = await db.refund.findMany({
        where: { orderId },
        select: { id: true },
      });
      if (refunds.length)
        await db.refundAttempt.deleteMany({
          where: { refundId: { in: refunds.map((refund) => refund.id) } },
        });
      await db.refund.deleteMany({ where: { orderId } });
      await db.ticket.deleteMany({ where: { orderId } });
      await db.orderItem.deleteMany({ where: { orderId } });
      await db.payment.deleteMany({ where: { orderId } });
      await db.order.deleteMany({ where: { id: orderId } });
      await db.seat.deleteMany({ where: { id: seatId } });
      await db.seatCategory.deleteMany({ where: { showtimeId } });
      await db.showtime.deleteMany({ where: { id: showtimeId } });
      await db.event.deleteMany({ where: { id: eventId } });
    }
    if (db && userIds.length) {
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    if (originalRefundFailAttempts === undefined)
      delete process.env.MOCK_REFUND_FAIL_FIRST_ATTEMPTS;
    else
      process.env.MOCK_REFUND_FAIL_FIRST_ATTEMPTS = originalRefundFailAttempts;
  });

  it('retries with increasing backoff, exposes the terminal failure, then resolves only as mock', async () => {
    const cancellation = await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set('Cookie', buyerCookie)
      .expect(200);
    const refundId = cancellation.body.refund.id as string;

    await service.processRefundBatch();
    const first = await db.refund.findUniqueOrThrow({
      where: { id: refundId },
    });
    expect(first).toMatchObject({
      status: 'QUEUED',
      attempts: 1,
      failureCode: 'MOCK_PROVIDER_UNAVAILABLE',
    });
    expect(first.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(3_000);
    await db.refund.update({
      where: { id: refundId },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });

    await service.processRefundBatch();
    const second = await db.refund.findUniqueOrThrow({
      where: { id: refundId },
    });
    expect(second).toMatchObject({
      status: 'QUEUED',
      attempts: 2,
      failureCode: 'MOCK_PROVIDER_UNAVAILABLE',
    });
    expect(second.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(10_000);
    await db.refund.update({
      where: { id: refundId },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });

    await service.processRefundBatch();
    const terminal = await db.refund.findUniqueOrThrow({
      where: { id: refundId },
    });
    expect(terminal).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      failureCode: 'MOCK_PROVIDER_UNAVAILABLE',
    });
    expect(await db.refundAttempt.count({ where: { refundId } })).toBe(3);
    const operations = await request(app.getHttpServer())
      .get('/operations/refunds')
      .set('Cookie', accountantCookie)
      .expect(200);
    expect(operations.body.refunds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: refundId,
          status: 'FAILED',
          attempts: 3,
        }),
      ]),
    );

    const resolved = await request(app.getHttpServer())
      .post(`/operations/refunds/${refundId}/resolve-mock`)
      .set('Cookie', accountantCookie)
      .expect(200);
    expect(resolved.body).toMatchObject({
      id: refundId,
      status: 'SUCCEEDED',
      providerRef: `mock-refund-${refundId}`,
    });
    expect(await db.refundAttempt.count({ where: { refundId } })).toBe(3);
    expect(
      await db.seat.findUniqueOrThrow({ where: { id: seatId } }),
    ).toMatchObject({ isSold: false });
  });
});
