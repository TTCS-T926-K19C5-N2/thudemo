import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CouponType, OrderStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CouponsService } from '../src/coupons/coupons.service.js';
import { PAYMENT_GATEWAY } from '../src/payments/gateways/payment-gateway.interface.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { assertIntegrationDatabase } from './integration-database.js';

describe('S-56 coupons against isolated PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let coupons: CouponsService;
  let payments: PaymentsService;
  let eventId: string;
  let showtimeId: string;
  let organizerId: string;
  const buyerIds: string[] = [];
  const orderIds: string[] = [];
  const seatIds: string[] = [];
  const gatewayAmounts: number[] = [];

  async function createOrder(buyerId: string, seatId: string, amount = 101) {
    await db.seatHold.deleteMany({ where: { seatId } });
    const holdToken = randomUUID();
    const paymentExpiresAt = new Date(Date.now() + 600_000);
    const holdSession = await db.holdSession.create({
      data: {
        showtimeId,
        userId: buyerId,
        sessionHash: randomUUID(),
        token: holdToken,
        expectedSeatIds: [seatId],
        expiresAt: paymentExpiresAt,
      },
    });
    await db.seatHold.create({
      data: {
        seatId,
        showtimeId,
        holdSessionId: holdSession.id,
        token: holdToken,
        expiresAt: paymentExpiresAt,
      },
    });
    const order = await db.order.create({
      data: {
        userId: buyerId,
        eventId,
        showtimeId,
        status: OrderStatus.PENDING_PAYMENT,
        paymentExpiresAt,
        expiresAt: paymentExpiresAt,
        holdSessionId: holdSession.id,
        holdToken,
        totalAmount: amount,
        subtotalAmount: amount,
        discountAmount: 0,
        items: {
          create: { seatId, categoryName: 'QA', unitPrice: amount },
        },
      },
    });
    orderIds.push(order.id);
    return order;
  }

  beforeAll(async () => {
    assertIntegrationDatabase();
    app = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue({
        name: 'isolated-coupon-test-gateway',
        createPayment: async (input: { amount: number; gatewayRef: string }) => {
          gatewayAmounts.push(input.amount);
          return { redirectUrl: 'http://127.0.0.1:3410/test-payment', gatewayRef: input.gatewayRef };
        },
        verifyWebhook: async () => false,
        parseWebhook: async () => null,
      })
      .compile()
      .then((module) => module.createNestApplication());
    await app.init();
    db = app.get(PrismaService);
    coupons = app.get(CouponsService);
    payments = app.get(PaymentsService);

    // Earlier interrupted iterations used this exact synthetic name in this
    // isolated profile. Remove only those test-owned rows before reseeding.
    const staleFixtures = await db.event.findMany({
      where: { name: 'S-56 isolated fixture' },
      select: { id: true, organizerId: true },
    });
    for (const stale of staleFixtures) {
      const staleShows = await db.showtime.findMany({
        where: { eventId: stale.id },
        select: { id: true },
      });
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`DELETE FROM coupon_redemptions WHERE "orderId" IN (SELECT id FROM orders WHERE "eventId"=${stale.id}::uuid) OR "couponId" IN (SELECT id FROM coupons WHERE "eventId"=${stale.id}::uuid)`;
        await tx.$executeRaw`DELETE FROM ticket_mail_deliveries WHERE "orderId" IN (SELECT id FROM orders WHERE "eventId"=${stale.id}::uuid)`;
        await tx.$executeRaw`DELETE FROM tickets WHERE "orderId" IN (SELECT id FROM orders WHERE "eventId"=${stale.id}::uuid)`;
        await tx.$executeRaw`DELETE FROM order_logs WHERE "orderId" IN (SELECT id FROM orders WHERE "eventId"=${stale.id}::uuid)`;
        await tx.$executeRaw`DELETE FROM payments WHERE "orderId" IN (SELECT id FROM orders WHERE "eventId"=${stale.id}::uuid)`;
        await tx.$executeRaw`DELETE FROM order_items WHERE "orderId" IN (SELECT id FROM orders WHERE "eventId"=${stale.id}::uuid)`;
        await tx.$executeRaw`DELETE FROM orders WHERE "eventId"=${stale.id}::uuid`;
        await tx.coupon.deleteMany({ where: { eventId: stale.id } });
        for (const show of staleShows) {
          await tx.seatHold.deleteMany({ where: { showtimeId: show.id } });
          await tx.holdSession.deleteMany({ where: { showtimeId: show.id } });
          await tx.seat.deleteMany({ where: { showtimeId: show.id } });
          await tx.seatCategory.deleteMany({ where: { showtimeId: show.id } });
          await tx.showtime.delete({ where: { id: show.id } });
        }
        await tx.event.delete({ where: { id: stale.id } });
      });
    }
    const staleUsers = await db.user.findMany({
      where: { email: { startsWith: 'coupon-' } },
      select: { id: true },
    });
    if (staleUsers.length) {
      const ids = staleUsers.map((user) => user.id);
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }

    const [organizer, buyerA, buyerB, buyerC] = await Promise.all([
      db.user.create({
        data: {
          email: `coupon-owner-${randomUUID()}@test.invalid`,
          password: 'fixture',
          isEmailVerified: true,
        },
      }),
      db.user.create({
        data: {
          email: `coupon-buyer-a-${randomUUID()}@test.invalid`,
          password: 'fixture',
          isEmailVerified: true,
        },
      }),
      db.user.create({
        data: {
          email: `coupon-buyer-b-${randomUUID()}@test.invalid`,
          password: 'fixture',
          isEmailVerified: true,
        },
      }),
      db.user.create({
        data: {
          email: `coupon-buyer-c-${randomUUID()}@test.invalid`,
          password: 'fixture',
          isEmailVerified: true,
        },
      }),
    ]);
    organizerId = organizer.id;
    buyerIds.push(buyerA.id, buyerB.id, buyerC.id);
    const event = await db.event.create({
      data: {
        name: `S-56 isolated fixture ${process.env.AI_REMEDIATION_RUN_ID ?? 'run'}`,
        description: 'Run-bound coupon integration fixture',
        location: 'Local only',
        organizerId,
      },
    });
    eventId = event.id;
    const showtime = await db.showtime.create({
      data: {
        eventId,
        startTime: new Date(Date.now() + 86_400_000),
        status: 'ON_SALE',
      },
    });
    showtimeId = showtime.id;
    const category = await db.seatCategory.create({
      data: { showtimeId, name: 'QA', price: 101 },
    });
    for (let number = 1; number <= 3; number++) {
      const seat = await db.seat.create({
        data: { showtimeId, categoryId: category.id, row: 'QA', seatNumber: number },
      });
      seatIds.push(seat.id);
    }
  }, 30_000);

  afterAll(async () => {
    if (db) {
      if (showtimeId) {
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`DELETE FROM coupon_redemptions WHERE "orderId" IN (SELECT id FROM orders WHERE "showtimeId"=${showtimeId}::uuid)`;
          await tx.$executeRaw`DELETE FROM ticket_mail_deliveries WHERE "orderId" IN (SELECT id FROM orders WHERE "showtimeId"=${showtimeId}::uuid)`;
          await tx.$executeRaw`DELETE FROM tickets WHERE "orderId" IN (SELECT id FROM orders WHERE "showtimeId"=${showtimeId}::uuid)`;
          await tx.$executeRaw`DELETE FROM order_logs WHERE "orderId" IN (SELECT id FROM orders WHERE "showtimeId"=${showtimeId}::uuid)`;
          await tx.$executeRaw`DELETE FROM payments WHERE "orderId" IN (SELECT id FROM orders WHERE "showtimeId"=${showtimeId}::uuid)`;
          await tx.$executeRaw`DELETE FROM order_items WHERE "orderId" IN (SELECT id FROM orders WHERE "showtimeId"=${showtimeId}::uuid)`;
          await tx.$executeRaw`DELETE FROM orders WHERE "showtimeId"=${showtimeId}::uuid`;
        });
      }
      if (eventId) await db.coupon.deleteMany({ where: { eventId } });
      if (showtimeId) {
        await db.seatHold.deleteMany({ where: { showtimeId } });
        await db.holdSession.deleteMany({ where: { showtimeId } });
        await db.seat.deleteMany({ where: { showtimeId } });
        await db.seatCategory.deleteMany({ where: { showtimeId } });
        await db.showtime.deleteMany({ where: { id: showtimeId } });
      }
      if (eventId) await db.event.deleteMany({ where: { id: eventId } });
      const userIds = [...buyerIds, organizerId].filter(Boolean);
      if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  it('floors percentage discounts, persists snapshots, and releases a removed coupon', async () => {
    const order = await createOrder(buyerIds[1], seatIds[0]);
    await coupons.createForOwner(eventId, organizerId, {
      code: 'FLOOR10',
      type: CouponType.PERCENT,
      value: 10,
      maxUses: 2,
      startsAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 600_000),
    });

    const applied = await coupons.applyToOrder(order.id, buyerIds[1], { code: 'floor10' });
    expect(applied.order).toMatchObject({ subtotalAmount: 101, discountAmount: 10, totalAmount: 91 });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      subtotalAmount: 101,
      discountAmount: 10,
      totalAmount: 91,
      couponCodeSnapshot: 'FLOOR10',
    });
    await coupons.createForOwner(eventId, organizerId, {
      code: 'SINGLE20',
      type: CouponType.PERCENT,
      value: 20,
      maxUses: 2,
      startsAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 600_000),
    });
    const replacement = await coupons.applyToOrder(order.id, buyerIds[1], { code: 'SINGLE20' });
    expect(replacement.order).toMatchObject({ subtotalAmount: 101, discountAmount: 20, totalAmount: 81, couponCode: 'SINGLE20' });
    expect(await db.couponRedemption.count({ where: { orderId: order.id } })).toBe(1);
    await coupons.removeFromOrder(order.id, buyerIds[1]);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      subtotalAmount: 101,
      discountAmount: 0,
      totalAmount: 101,
      couponId: null,
    });
    expect(await db.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({ status: 'RELEASED' });
    await db.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED } });
  });

  it('confirms a zero-payable fixed coupon order without a payment and issues admission inventory', async () => {
    const order = await createOrder(buyerIds[1], seatIds[0]);
    const coupon = await coupons.createForOwner(eventId, organizerId, {
      code: `FREE${randomUUID().slice(0, 8)}`,
      type: CouponType.FIXED,
      value: 500,
      maxUses: 1,
      startsAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 600_000),
    });
    const result = await coupons.applyToOrder(order.id, buyerIds[1], { code: coupon.code });
    expect(result).toMatchObject({
      confirmedFree: true,
      order: { status: OrderStatus.PAID, subtotalAmount: 101, discountAmount: 101, totalAmount: 0 },
    });
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.seat.findUniqueOrThrow({ where: { id: seatIds[0] } })).toMatchObject({ isSold: true });
    expect(await db.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({ status: 'REDEEMED' });
  });

  it('initiates the local payment request using the discounted immutable order snapshot', async () => {
    const order = await createOrder(buyerIds[1], seatIds[0]);
    const coupon = await coupons.createForOwner(eventId, organizerId, {
      code: `PAY${randomUUID().slice(0, 8)}`,
      type: CouponType.FIXED,
      value: 10,
      maxUses: 1,
      startsAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 600_000),
    });
    await coupons.applyToOrder(order.id, buyerIds[1], { code: coupon.code });
    const result = await payments.initiatePayment(order.id, buyerIds[1]);
    expect(result.redirectUrl).toBe('http://127.0.0.1:3410/test-payment');
    expect(gatewayAmounts.at(-1)).toBe(91);
    expect(await db.payment.findUniqueOrThrow({ where: { id: result.paymentId } })).toMatchObject({ amount: 91, status: 'INITIATED' });
  });

  it('serializes concurrent reservations at a one-use coupon cap on PostgreSQL', async () => {
    const coupon = await coupons.createForOwner(eventId, organizerId, {
      code: `CAP${randomUUID().slice(0, 8)}`,
      type: CouponType.FIXED,
      value: 1,
      maxUses: 1,
      startsAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 600_000),
    });
    const [a, b] = await Promise.all([
      createOrder(buyerIds[0], seatIds[1]),
      createOrder(buyerIds[2], seatIds[2]),
    ]);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    let arrived = 0;
    const applyAtBarrier = async (orderId: string, buyerId: string) => {
      arrived++;
      if (arrived === 2) release();
      await barrier;
      return coupons.applyToOrder(orderId, buyerId, { code: coupon.code });
    };
    const outcomes = await Promise.allSettled([
      applyAtBarrier(a.id, buyerIds[0]),
      applyAtBarrier(b.id, buyerIds[2]),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await db.couponRedemption.count({ where: { couponId: coupon.id, status: 'RESERVED' } })).toBe(1);
  }, 30_000);
});
