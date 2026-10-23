import { assertIntegrationDatabase } from './integration-database.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CancellationsService } from '../src/lifecycle/cancellations.service.js';
import { ReportsService } from '../src/lifecycle/reports.service.js';
import { WaitlistService } from '../src/waitlist/waitlist.service.js';
import { buildMomoSignature } from '../src/payments/gateways/momo-signature.js';

describe('S45 approved local mock cancellation policy', () => {
  let app: INestApplication;
  let db: PrismaService;
  let buyerCookie: string;
  let otherBuyerCookie: string;
  let staffCookie: string;
  let gateId: string;
  let organizerId: string;
  let buyerId: string;
  let otherBuyerId: string;
  let showtimeId: string;
  let eventId: string;
  let categoryId: string;
  const userIds: string[] = [];
  const orderIds: string[] = [];
  const seatIds: string[] = [];

  async function cleanupRunBoundFixtures() {
    if (!db) return;
    const events = await db.event.findMany({
      where: {
        name: 'S45 cancellation test',
        description: 'Run-bound local cancellation fixture',
      },
      select: { id: true },
    });
    const eventIds = events.map((event) => event.id);
    const shows = eventIds.length
      ? await db.showtime.findMany({
          where: { eventId: { in: eventIds } },
          select: { id: true },
        })
      : [];
    const showIds = shows.map((show) => show.id);
    if (showIds.length) {
      await db.waitlistNotification.deleteMany({
        where: { entry: { showtimeId: { in: showIds } } },
      });
      await db.waitlistAvailabilitySignal.deleteMany({
        where: { showtimeId: { in: showIds } },
      });
      await db.waitlistEntry.deleteMany({ where: { showtimeId: { in: showIds } } });
    }
    const fixtureOrders = showIds.length
      ? await db.order.findMany({
          where: { showtimeId: { in: showIds } },
          select: { id: true },
        })
      : [];
    const allOrderIds = [
      ...new Set([...orderIds, ...fixtureOrders.map((o) => o.id)]),
    ];
    const refunds = allOrderIds.length
      ? await db.refund.findMany({
          where: { orderId: { in: allOrderIds } },
          select: { id: true },
        })
      : [];
    if (refunds.length)
      await db.refundAttempt.deleteMany({
        where: { refundId: { in: refunds.map((refund) => refund.id) } },
      });
    if (allOrderIds.length) {
      await db.refund.deleteMany({ where: { orderId: { in: allOrderIds } } });
      await db.operationMail.deleteMany({
        where: { orderId: { in: allOrderIds } },
      });
      await db.ticketMailDelivery.deleteMany({
        where: { orderId: { in: allOrderIds } },
      });
      await db.ticket.deleteMany({ where: { orderId: { in: allOrderIds } } });
      await db.orderItem.deleteMany({
        where: { orderId: { in: allOrderIds } },
      });
      await db.payment.deleteMany({ where: { orderId: { in: allOrderIds } } });
      await db.order.deleteMany({ where: { id: { in: allOrderIds } } });
    }
    if (showIds.length)
      await db.showtimeCancellation.deleteMany({
        where: { showtimeId: { in: showIds } },
      });
    if (showIds.length) {
      const gates = await db.checkInGate.findMany({ where: { showtimeId: { in: showIds } }, select: { id: true } });
      if (gates.length) await db.checkInPermission.deleteMany({ where: { gateId: { in: gates.map((gate) => gate.id) } } });
      await db.ticketAdmission.deleteMany({ where: { showtimeId: { in: showIds } } });
      await db.checkInGate.deleteMany({ where: { showtimeId: { in: showIds } } });
      await db.seatHold.deleteMany({ where: { showtimeId: { in: showIds } } });
      await db.holdSession.deleteMany({ where: { showtimeId: { in: showIds } } });
      await db.seat.deleteMany({ where: { showtimeId: { in: showIds } } });
      await db.seatCategory.deleteMany({
        where: { showtimeId: { in: showIds } },
      });
      await db.showtime.deleteMany({ where: { id: { in: showIds } } });
    }
    if (eventIds.length)
      await db.event.deleteMany({ where: { id: { in: eventIds } } });
    const fixtureUsers = await db.user.findMany({
      where: { email: { endsWith: '@s45-cancel-e2e.test' } },
      select: { id: true },
    });
    const allUserIds = [
      ...new Set([...userIds, ...fixtureUsers.map((user) => user.id)]),
    ];
    if (allUserIds.length) {
      await db.session.deleteMany({ where: { userId: { in: allUserIds } } });
      await db.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
      await db.user.deleteMany({ where: { id: { in: allUserIds } } });
    }
    const [remainingEvents, remainingUsers] = await Promise.all([
      db.event.count({
        where: {
          name: 'S45 cancellation test',
          description: 'Run-bound local cancellation fixture',
        },
      }),
      db.user.count({
        where: { email: { endsWith: '@s45-cancel-e2e.test' } },
      }),
    ]);
    if (remainingEvents || remainingUsers)
      throw new Error(
        `S45 test fixture cleanup incomplete (events=${remainingEvents}, users=${remainingUsers}).`,
      );
  }

  async function createAccount(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const roleRecord = await db.role.findUniqueOrThrow({
      where: { name: role },
    });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@s45-cancel-e2e.test`,
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

  async function createPaidOrder(options: { checkedIn?: boolean } = {}) {
    const seats = await db.seat.createManyAndReturn({
      data: [1, 2].map((seatNumber) => ({
        showtimeId,
        categoryId,
        row: 'C',
        seatNumber: seatIds.length + seatNumber,
        isSold: true,
      })),
    });
    seatIds.push(...seats.map((seat) => seat.id));
    const order = await db.order.create({
      data: {
        userId: buyerId,
        eventId,
        showtimeId,
        status: OrderStatus.PAID,
        totalAmount: 250_000,
        paymentExpiresAt: new Date(Date.now() + 600_000),
        expiresAt: new Date(Date.now() + 600_000),
        items: {
          create: seats.map((seat, index) => ({
            seatId: seat.id,
            categoryName: 'STANDARD',
            unitPrice: 125_000,
            checkedInAt: options.checkedIn && index === 0 ? new Date() : null,
          })),
        },
      },
      include: { items: true },
    });
    orderIds.push(order.id);
    await db.ticket.createMany({
      data: order.items.map((item, index) => ({
        orderId: order.id,
        showtimeId,
        seatId: item.seatId,
        code: `S45-${randomUUID()}`,
        seatLabel: `C-${index + 1}`,
        ticketType: 'STANDARD',
        price: item.unitPrice,
      })),
    });
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        amount: 250_000,
        status: PaymentStatus.SUCCEEDED,
        gateway: 'mock',
        gatewayRef: `s45-${randomUUID()}`,
      },
    });
    return { order, seats, payment };
  }

  beforeAll(async () => {
    assertIntegrationDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    await cleanupRunBoundFixtures();

    const organizer = await createAccount('ORGANIZER');
    const buyer = await createAccount('BUYER');
    const otherBuyer = await createAccount('BUYER');
    const staff = await createAccount('STAFF');
    organizerId = organizer.id;
    buyerId = buyer.id;
    otherBuyerId = otherBuyer.id;
    buyerCookie = buyer.cookie;
    otherBuyerCookie = otherBuyer.cookie;

    const event = await db.event.create({
      data: {
        name: 'S45 cancellation test',
        description: 'Run-bound local cancellation fixture',
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
    const gate = await db.checkInGate.create({ data: { showtimeId, name: 'S45 QA gate' } });
    gateId = gate.id;
    await db.checkInPermission.create({ data: { userId: staff.id, gateId, staffName: 'Synthetic QA staff' } });
    staffCookie = staff.cookie;
    const category = await db.seatCategory.create({
      data: { showtimeId, name: 'STANDARD', price: 125_000 },
    });
    categoryId = category.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupRunBoundFixtures();
    if (app) await app.close();
  });

  it('previews and cancels the whole paid mock order, refunds 100%, and releases all seats', async () => {
    const { order, seats } = await createPaidOrder();
    const ticketsBeforeCancel = await request(app.getHttpServer())
      .get('/tickets/me')
      .set('Cookie', buyerCookie)
      .expect(200);
    const priorTicket = ticketsBeforeCancel.body.tickets.find(
      (ticket: { orderId: string; qrPayload: string | null }) => ticket.orderId === order.id && ticket.qrPayload,
    );
    expect(priorTicket?.qrPayload).toBeTruthy();
    const preview = await request(app.getHttpServer())
      .get(`/orders/${order.id}/cancellation`)
      .set('Cookie', buyerCookie)
      .expect(200);
    expect(preview.body).toMatchObject({
      orderId: order.id,
      amount: 250_000,
      eligible: true,
      policy: { scope: 'WHOLE_ORDER', refundPercent: 100, gateway: 'mock' },
    });

    const cancelled = await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', buyerCookie)
      .expect(200);
    expect(cancelled.body.refund).toMatchObject({
      orderId: order.id,
      amount: 250_000,
      reason: 'local-demo-24h-100-v1',
    });
    await app.get(CancellationsService).processRefundBatch();

    const [storedOrder, refund, storedTickets, storedSeats] = await Promise.all(
      [
        db.order.findUniqueOrThrow({ where: { id: order.id } }),
        db.refund.findUniqueOrThrow({ where: { orderId: order.id } }),
        db.ticket.findMany({ where: { orderId: order.id } }),
        db.seat.findMany({
          where: { id: { in: seats.map((seat) => seat.id) } },
        }),
      ],
    );
    expect(storedOrder.status).toBe('CANCELLED');
    expect(refund).toMatchObject({
      amount: 250_000,
      status: 'SUCCEEDED',
      attempts: 1,
    });
    const audit = await db.domainAudit.findMany({ where: { orderId: order.id } });
    expect(audit.some((row) => row.entityType === 'orders' && row.action === 'UPDATE'
      && (row.beforeState as { status?: string } | null)?.status === 'PAID'
      && (row.afterState as { status?: string } | null)?.status === 'CANCELLED'
      && row.actorId === buyerId)).toBe(true);
    expect(audit.some((row) => row.entityType === 'tickets' && row.action === 'UPDATE'
      && (row.afterState as { status?: string } | null)?.status === 'CANCELLED')).toBe(true);
    expect(audit.some((row) => row.entityType === 'refunds' && row.action === 'INSERT'
      && row.actorId === buyerId)).toBe(true);
    expect(storedTickets).toHaveLength(2);
    expect(storedTickets.every((ticket) => ticket.status === 'CANCELLED')).toBe(
      true,
    );
    expect(storedSeats.every((seat) => !seat.isSold)).toBe(true);

    const ticketsAfterCancel = await request(app.getHttpServer())
      .get('/tickets/me')
      .set('Cookie', buyerCookie)
      .expect(200);
    const cancelledView = ticketsAfterCancel.body.tickets.filter(
      (ticket: { orderId: string }) => ticket.orderId === order.id,
    );
    expect(cancelledView).toHaveLength(2);
    expect(cancelledView.every((ticket: { status: string; qrPayload: string | null }) => ticket.status === 'CANCELLED' && ticket.qrPayload === null)).toBe(true);
    const oldQrScan = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send({ gateId, qrPayload: priorTicket.qrPayload })
      .expect(404);
    expect(oldQrScan.body.code).toBe('UNKNOWN_TICKET');
    expect(
      await db.ticketAdmission.count({
        where: { ticketId: { in: order.items.map((item) => item.id) } },
      }),
    ).toBe(0);

    const reclaim = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/holds`)
      .set('Cookie', otherBuyerCookie)
      .send({ seatIds: [seats[0].id] })
      .expect(200);
    expect(reclaim.body.hold.seatIds).toContain(seats[0].id);
    const resale = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/orders`)
      .set('Cookie', otherBuyerCookie)
      .expect(200);
    expect(resale.body.order.items.map((item: { seatId: string }) => item.seatId)).toContain(seats[0].id);
    const resaleOrder = await db.order.findUniqueOrThrow({ where: { id: resale.body.order.id } });
    expect(resaleOrder.userId).toBe(otherBuyerId);
    // The AC checks that the released seat can be reclaimed and ordered; remove
    // this test-only pending order/hold now so later cases start independently.
    await db.orderItem.deleteMany({ where: { orderId: resaleOrder.id } });
    await db.order.delete({ where: { id: resaleOrder.id } });
    await db.seatHold.deleteMany({ where: { seatId: seats[0].id } });
    if (resaleOrder.holdSessionId)
      await db.holdSession.deleteMany({ where: { id: resaleOrder.holdSessionId } });
  });

  it('allocates a coupon discount to ticket refunds so category net reconciles to zero', async () => {
    const reports = app.get(ReportsService);
    const before = await reports.financial(showtimeId, {
      id: organizerId,
      roles: ['ORGANIZER'],
    } as any);
    const beforeCategory = before.categories.find((row) => row.category === 'STANDARD')!;
    const { order, payment } = await createPaidOrder();
    await db.order.update({
      where: { id: order.id },
      data: { subtotalAmount: 250_000, discountAmount: 1, totalAmount: 249_999 },
    });
    await db.payment.update({
      where: { id: payment.id },
      data: { amount: 249_999 },
    });
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', buyerCookie)
      .expect(200);
    await app.get(CancellationsService).processRefundBatch();

    const after = await reports.financial(showtimeId, {
      id: organizerId,
      roles: ['ORGANIZER'],
    } as any);
    const afterCategory = after.categories.find((row) => row.category === 'STANDARD')!;
    expect(afterCategory.gross - beforeCategory.gross).toBe(250_000);
    expect(afterCategory.discount - beforeCategory.discount).toBe(1);
    expect(afterCategory.refunded - beforeCategory.refunded).toBe(249_999);
    expect(afterCategory.net - beforeCategory.net).toBe(0);
  });

  it('publishes a durable FIFO waitlist signal after a refund releases seats', async () => {
    const firstJoinedAt = new Date();
    await db.waitlistEntry.createMany({
      data: [buyerId, otherBuyerId].map((userId, index) => ({
        showtimeId,
        userId,
        createdAt: new Date(firstJoinedAt.getTime() + index * 1000),
      })),
    });
    const { order } = await createPaidOrder();
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', buyerCookie)
      .expect(200);
    const signal = await db.waitlistAvailabilitySignal.findFirstOrThrow({
      where: { showtimeId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    expect(signal.releasedCount).toBe(2);

    const waitlist = app.get(WaitlistService);
    expect(await waitlist.processSignalBatch()).toBe(signal.id);
    const notices = await db.waitlistNotification.findMany({
      where: { signalId: signal.id },
      include: { entry: true },
      orderBy: [{ entry: { createdAt: 'asc' } }, { entryId: 'asc' }],
    });
    expect(notices).toHaveLength(2);
    expect(notices.map((notice) => notice.entry.userId)).toEqual([buyerId, otherBuyerId]);
    expect(await db.seatHold.count({ where: { showtimeId } })).toBe(0);
  });

  it('rejects another buyer, rejects an admitted order, and leaves paid seats unchanged', async () => {
    const { order, seats } = await createPaidOrder({ checkedIn: true });
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', otherBuyerCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Cookie', buyerCookie)
      .expect(409);

    const [storedOrder, refund, storedSeats] = await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: order.id } }),
      db.refund.findUnique({ where: { orderId: order.id } }),
      db.seat.findMany({ where: { id: { in: seats.map((seat) => seat.id) } } }),
    ]);
    expect(storedOrder.status).toBe('PAID');
    expect(refund).toBeNull();
    expect(storedSeats.every((seat) => seat.isSold)).toBe(true);
  });

  it('rejects a buyer cancellation inside the 24-hour cutoff with a reason', async () => {
    const { order, seats } = await createPaidOrder();
    await db.showtime.update({
      where: { id: showtimeId },
      data: { startTime: new Date(Date.now() + 23 * 60 * 60 * 1000) },
    });
    try {
      const preview = await request(app.getHttpServer())
        .get(`/orders/${order.id}/cancellation`)
        .set('Cookie', buyerCookie)
        .expect(200);
      expect(preview.body.eligible).toBe(false);
      expect(preview.body.unavailable).toMatch(/24/);
      await request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set('Cookie', buyerCookie)
        .expect(409);
      expect(
        await db.order
          .findUniqueOrThrow({ where: { id: order.id } })
          .then((x) => x.status),
      ).toBe('PAID');
      expect(
        await db.refund.findUnique({ where: { orderId: order.id } }),
      ).toBeNull();
      expect(
        await db.seat.count({
          where: { id: { in: seats.map((s) => s.id) }, isSold: true },
        }),
      ).toBe(2);
    } finally {
      await db.showtime.update({
        where: { id: showtimeId },
        data: { startTime: new Date(Date.now() + 48 * 60 * 60 * 1000) },
      });
    }
  });

  it('serializes simultaneous cancellation requests to one refund record', async () => {
    const { order, seats } = await createPaidOrder();
    const [left, right] = await Promise.all([
      request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set('Cookie', buyerCookie),
      request(app.getHttpServer())
        .post(`/orders/${order.id}/cancel`)
        .set('Cookie', buyerCookie),
    ]);
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([
      200, 200,
    ]);
    expect(left.body.refund.id).toBe(right.body.refund.id);
    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      await db.seat.count({
        where: { id: { in: seats.map((s) => s.id) }, isSold: true },
      }),
    ).toBe(0);
  });

  it('R18: cancellation/refund racing a duplicate successful webhook keeps one refund and invalidates tickets', async () => {
    const { order, seats, payment } = await createPaidOrder();
    const gatewayRef = payment.gatewayRef;
    const extraData = Buffer.from(JSON.stringify({ orderId: order.id })).toString('base64');
    const payload: Record<string, unknown> = {
      partnerCode: 'MOMO', orderId: gatewayRef, requestId: gatewayRef,
      amount: payment.amount, orderInfo: `Paid order ${order.id}`,
      orderType: 'momo_wallet', transId: `s45_duplicate_${randomUUID()}`,
      resultCode: 0, message: 'Successful duplicate test event.', payType: 'qr',
      responseTime: Date.now(), extraData,
    };
    payload.signature = buildMomoSignature(
      payload,
      process.env.MOMO_ACCESS_KEY ?? 'F8BBA842ECF85',
      process.env.MOMO_SECRET_KEY ?? process.env.PAYMENT_WEBHOOK_SECRET ?? 'K951B6PE1waDMi640xX08PD3vg6EkVlz',
    );
    const [cancelled, webhook] = await Promise.all([
      request(app.getHttpServer()).post(`/orders/${order.id}/cancel`).set('Cookie', buyerCookie),
      request(app.getHttpServer()).post('/payments/webhook').send(payload),
    ]);
    expect(cancelled.status).toBe(200);
    expect(webhook.status).toBe(200);
    expect(['PAID', 'CANCELLED']).toContain(webhook.body.status);
    const [finalOrder, refund, finalPayment, tickets, finalSeats] = await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: order.id } }),
      db.refund.findUniqueOrThrow({ where: { orderId: order.id } }),
      db.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      db.ticket.findMany({ where: { orderId: order.id } }),
      db.seat.findMany({ where: { id: { in: seats.map((seat) => seat.id) } } }),
    ]);
    expect(finalOrder.status).toBe(OrderStatus.CANCELLED);
    expect(refund.amount).toBe(payment.amount);
    expect(finalPayment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(tickets).toHaveLength(2);
    expect(tickets.every((ticket) => ticket.status === 'CANCELLED')).toBe(true);
    expect(finalSeats.every((seat) => seat.isSold === false)).toBe(true);
    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('cancelling a show suppresses queued and pending waitlist notices', async () => {
    const pendingSignal = await db.waitlistAvailabilitySignal.create({
      data: { showtimeId, releasedCount: 1 },
    });
    await app.get(CancellationsService).cancelShow(
      showtimeId,
      { id: organizerId, roles: ['ORGANIZER'] } as any,
      'QA show cancellation',
    );

    expect(
      await db.waitlistAvailabilitySignal.findUniqueOrThrow({
        where: { id: pendingSignal.id },
      }),
    ).toMatchObject({ status: 'CANCELLED' });
    const [entries, notices] = await Promise.all([
      db.waitlistEntry.findMany({ where: { showtimeId } }),
      db.waitlistNotification.findMany({ where: { entry: { showtimeId } } }),
    ]);
    expect(entries.every((entry) => entry.status === 'CANCELLED')).toBe(true);
    expect(
      notices.every((notice) => ['CANCELLED', 'SENT', 'FAILED'].includes(notice.status)),
    ).toBe(true);
    expect(
      await db.waitlistNotification.count({
        where: { entry: { showtimeId }, status: { in: ['QUEUED', 'SENDING'] } },
      }),
    ).toBe(0);
    expect(
      await db.waitlistAvailabilitySignal.count({
        where: { showtimeId, status: 'PENDING' },
      }),
    ).toBe(0);
  });
});
