import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { WaitlistService } from '../src/waitlist/waitlist.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { HoldsService } from '../src/holds/holds.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PrivacyService } from '../src/lifecycle/privacy.service.js';
import { assertIntegrationDatabase } from './integration-database.js';

describe('S-59 waitlist FIFO and SMTP catcher on isolated PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let waitlist: WaitlistService;
  let mail: MailService;
  let holds: HoldsService;
  let orders: OrdersService;
  let privacy: PrivacyService;
  const run = process.env.AI_REMEDIATION_RUN_ID;
  const marker = `S-59 ${run} ${randomUUID()}`;
  let eventId: string;
  let showtimeId: string;
  const users: string[] = [];
  const entries: string[] = [];
  const signalIds: string[] = [];
  const orderIds: string[] = [];

  async function createExtraSubscriber() {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@s59.test.invalid`,
        password: 'fixture',
        isEmailVerified: true,
      },
    });
    users.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    assertIntegrationDatabase();
    if (!run || !/^\d{8}T\d{6}-remediation$/.test(run)) throw new Error('Run id missing');
    app = await Test.createTestingModule({ imports: [AppModule] }).compile().then((m) => m.createNestApplication());
    await app.init();
    db = app.get(PrismaService);
    waitlist = app.get(WaitlistService);
    mail = app.get(MailService);
    holds = app.get(HoldsService);
    orders = app.get(OrdersService);
    privacy = app.get(PrivacyService);
    const stale = await db.event.findMany({ where: { name: { startsWith: `S-59 ${run} ` } }, select: { id: true, organizerId: true } });
    for (const old of stale) {
      const shows = await db.showtime.findMany({ where: { eventId: old.id }, select: { id: true } });
      await db.$transaction(async (tx) => {
        for (const show of shows) {
          await tx.waitlistNotification.deleteMany({ where: { entry: { showtimeId: show.id } } });
          await tx.waitlistAvailabilitySignal.deleteMany({ where: { showtimeId: show.id } });
          await tx.waitlistEntry.deleteMany({ where: { showtimeId: show.id } });
          await tx.orderItem.deleteMany({ where: { order: { showtimeId: show.id } } });
          await tx.order.deleteMany({ where: { showtimeId: show.id } });
          await tx.seatHold.deleteMany({ where: { showtimeId: show.id } });
          await tx.holdSession.deleteMany({ where: { showtimeId: show.id } });
          await tx.seat.deleteMany({ where: { showtimeId: show.id } });
          await tx.seatCategory.deleteMany({ where: { showtimeId: show.id } });
          await tx.showtime.delete({ where: { id: show.id } });
        }
        await tx.event.delete({ where: { id: old.id } });
        const staleUsers = await tx.user.findMany({
          where: { OR: [{ id: old.organizerId }, { email: { endsWith: '@s59.test.invalid' } }] },
          select: { id: true },
        });
        const staleUserIds = staleUsers.map((user) => user.id);
        await tx.erasureRequest.deleteMany({
          where: { OR: [{ userId: { in: staleUserIds } }, { approvedBy: { in: staleUserIds } }] },
        });
        await tx.consentEvent.deleteMany({ where: { userId: { in: staleUserIds } } });
        await tx.registrationConsent.deleteMany({ where: { userId: { in: staleUserIds } } });
        await tx.user.deleteMany({ where: { OR: [{ id: old.organizerId }, { email: { endsWith: '@s59.test.invalid' } }] } });
      });
    }
    const [organizer, first, second, third, raceBuyer] = await Promise.all([
      db.user.create({ data: { email: `${randomUUID()}@s59.test.invalid`, password: 'fixture', isEmailVerified: true } }),
      db.user.create({ data: { email: `${randomUUID()}@s59.test.invalid`, password: 'fixture', isEmailVerified: true } }),
      db.user.create({ data: { email: `${randomUUID()}@s59.test.invalid`, password: 'fixture', isEmailVerified: true } }),
      db.user.create({ data: { email: `${randomUUID()}@s59.test.invalid`, password: 'fixture', isEmailVerified: true } }),
      db.user.create({ data: { email: `${randomUUID()}@s59.test.invalid`, password: 'fixture', isEmailVerified: true } }),
    ]);
    users.push(organizer.id, first.id, second.id, third.id, raceBuyer.id);
    const event = await db.event.create({ data: { name: marker, description: 'Run-bound waitlist fixture', location: 'Local', organizerId: organizer.id, status: 'PUBLISHED' } });
    eventId = event.id;
    const show = await db.showtime.create({ data: { eventId, startTime: new Date(Date.now() + 86_400_000), status: 'ON_SALE' } });
    showtimeId = show.id;
    const category = await db.seatCategory.create({ data: { showtimeId, name: 'QA', price: 1000 } });
    await db.seat.createMany({ data: [1, 2].map((seatNumber) => ({ showtimeId, categoryId: category.id, row: 'A', seatNumber, isSold: true })) });
    for (const userId of users.slice(1, 4)) {
      const response = await waitlist.join(showtimeId, userId);
      entries.push(response.entry.id);
    }
  });

  afterAll(async () => {
    if (db && eventId) {
      await db.$transaction(async (tx) => {
        await tx.waitlistNotification.deleteMany({ where: { entryId: { in: entries } } });
        await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
        await tx.waitlistAvailabilitySignal.deleteMany({ where: { showtimeId } });
        await tx.waitlistEntry.deleteMany({ where: { showtimeId } });
        await tx.seatHold.deleteMany({ where: { showtimeId } });
        await tx.holdSession.deleteMany({ where: { showtimeId } });
        await tx.seat.deleteMany({ where: { showtimeId } });
        await tx.seatCategory.deleteMany({ where: { showtimeId } });
        await tx.showtime.delete({ where: { id: showtimeId } });
        await tx.event.delete({ where: { id: eventId } });
        await tx.erasureRequest.deleteMany({
          where: { OR: [{ userId: { in: users } }, { approvedBy: { in: users } }] },
        });
        await tx.consentEvent.deleteMany({ where: { userId: { in: users } } });
        await tx.registrationConsent.deleteMany({ where: { userId: { in: users } } });
        await tx.user.deleteMany({ where: { id: { in: users } } });
      });
    }
    await app?.close();
  });

  it('rejects a duplicate active registration and enforces account ownership', async () => {
    await expect(waitlist.join(showtimeId, users[1])).rejects.toThrow();
    await expect(waitlist.unsubscribe(showtimeId, users[0])).rejects.toThrow();
    expect((await waitlist.current(showtimeId, users[1])).entry?.id).toBe(entries[0]);
  });

  it('serializes simultaneous duplicate joins with one active entry and a conflict result', async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const racingBuyerId = users[4];
    const joins = [1, 2].map(async () => { await barrier; return waitlist.join(showtimeId, racingBuyerId); });
    release();
    const outcomes = await Promise.allSettled(joins);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const raceEntries = await db.waitlistEntry.findMany({ where: { showtimeId, userId: racingBuyerId, status: { not: 'CANCELLED' } } });
    expect(raceEntries).toHaveLength(1);
    entries.push(raceEntries[0].id);
  });

  it('notifies exactly the first N FIFO entries, without placing holds, then records catcher acceptance', async () => {
    const seats = await db.seat.findMany({ where: { showtimeId }, orderBy: [{ row: 'asc' }, { seatNumber: 'asc' }] });
    await db.seat.update({ where: { id: seats[0].id }, data: { isSold: false } });
    const signal = await db.waitlistAvailabilitySignal.create({ data: { showtimeId, releasedCount: 1 } });
    signalIds.push(signal.id);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const workers = [1, 2].map(async () => { await barrier; return waitlist.processSignalBatch(); });
    release();
    const claims = await Promise.all(workers);
    expect(claims.filter((claimed) => claimed === signal.id)).toHaveLength(1);
    expect(claims.filter((claimed) => claimed === null)).toHaveLength(1);
    expect(await db.seatHold.count({ where: { showtimeId } })).toBe(0);
    expect(await db.waitlistNotification.count({ where: { entryId: { in: entries }, status: 'QUEUED' } })).toBe(1);
    const deliveries = await Promise.all([waitlist.deliverNotification(), waitlist.deliverNotification()]);
    expect(deliveries.filter(Boolean)).toHaveLength(1);
    const first = await db.waitlistEntry.findUniqueOrThrow({ where: { id: entries[0] } });
    const second = await db.waitlistEntry.findUniqueOrThrow({ where: { id: entries[1] } });
    const third = await db.waitlistEntry.findUniqueOrThrow({ where: { id: entries[2] } });
    expect(first.status).toBe('NOTIFIED');
    expect(second.status).toBe('ACTIVE');
    expect(third.status).toBe('ACTIVE');
    expect(await db.waitlistNotification.count({ where: { entryId: entries[0], status: 'SENT' } })).toBe(1);

    const manifest = JSON.parse(readFileSync(process.env.AI_REMEDIATION_PROFILE_MANIFEST!, 'utf8')) as { smtp: { catcher_ui_port: number } };
    const response = await fetch(`http://127.0.0.1:${manifest.smtp.catcher_ui_port}/api/v1/messages`);
    expect(response.ok).toBe(true);
    const inbox = await response.json() as { messages?: Array<{ Subject?: string; To?: Array<{ Address?: string }> }> };
    expect(inbox.messages?.some((message) => message.Subject?.includes('Ghế đã mở bán'))).toBe(true);
  });

  it('retries SMTP failure at most three times and returns the entry to FIFO-active state', async () => {
    const seats = await db.seat.findMany({ where: { showtimeId }, orderBy: [{ row: 'asc' }, { seatNumber: 'asc' }] });
    await db.seat.update({ where: { id: seats[1].id }, data: { isSold: false } });
    const signal = await db.waitlistAvailabilitySignal.create({ data: { showtimeId, releasedCount: 1 } });
    signalIds.push(signal.id);
    expect(await waitlist.processSignalBatch()).toBe(signal.id);
    const notice = await db.waitlistNotification.findFirstOrThrow({ where: { entryId: entries[1], signalId: signal.id } });
    const send = vi.spyOn(mail, 'send').mockRejectedValue(new Error('catcher unavailable'));
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await db.waitlistNotification.update({ where: { id: notice.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
        expect(await waitlist.deliverNotification()).toBe(true);
      }
    } finally {
      send.mockRestore();
    }
    const result = await db.waitlistNotification.findUniqueOrThrow({ where: { id: notice.id } });
    expect(result.attempts).toBe(3);
    expect(result.status).toBe('FAILED');
    expect(result.failureCode).toBe('RETRY_EXHAUSTED');
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: entries[1] } })).status).toBe('ACTIVE');
  });

  it('creates a durable FIFO trigger when an expired seat hold is actually cleaned up', async () => {
    const seat = await db.seat.findFirstOrThrow({ where: { showtimeId }, orderBy: [{ row: 'asc' }, { seatNumber: 'asc' }] });
    const holdToken = randomUUID();
    const session = await db.holdSession.create({ data: { showtimeId, userId: users[3], sessionHash: randomUUID(), token: holdToken, expectedSeatIds: [seat.id], expiresAt: new Date(Date.now() - 60_000) } });
    await db.seat.update({ where: { id: seat.id }, data: { isSold: false } });
    await db.seatHold.create({ data: { seatId: seat.id, showtimeId, holdSessionId: session.id, token: holdToken, expiresAt: new Date(Date.now() - 60_000) } });
    const deleted = await holds.cleanupBatch([{ seatId: seat.id, showtimeId, token: holdToken }]);
    expect(deleted).toBe(1);
    const signal = await db.waitlistAvailabilitySignal.findFirstOrThrow({ where: { showtimeId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
    expect(signal.releasedCount).toBe(1);
    signalIds.push(signal.id);
  });

  it('enqueues a signal in the real order-expiry transaction when an order releases its seat', async () => {
    const seat = await db.seat.findFirstOrThrow({ where: { showtimeId }, orderBy: [{ row: 'asc' }, { seatNumber: 'asc' }] });
    await db.seat.update({ where: { id: seat.id }, data: { isSold: false } });
    const token = randomUUID();
    const holdSession = await db.holdSession.create({ data: { showtimeId, userId: users[3], sessionHash: randomUUID(), token, expectedSeatIds: [seat.id], expiresAt: new Date(Date.now() + 60_000) } });
    const order = await db.order.create({ data: { userId: users[3], eventId, showtimeId, status: 'PENDING_PAYMENT', paymentExpiresAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() - 1000), holdSessionId: holdSession.id, holdToken: token, totalAmount: 1000, subtotalAmount: 1000, items: { create: { seatId: seat.id, categoryName: 'QA', unitPrice: 1000 } } } });
    orderIds.push(order.id);
    await db.seatHold.create({ data: { seatId: seat.id, showtimeId, holdSessionId: holdSession.id, token, expiresAt: new Date(Date.now() + 60_000) } });
    const result = await orders.expireOrder(order.id);
    expect(result.status).toBe('expired');
    const signal = await db.waitlistAvailabilitySignal.findFirstOrThrow({ where: { showtimeId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
    expect(signal.releasedCount).toBe(1);
    signalIds.push(signal.id);
  });

  it('cancels a queued notice when the subscriber unsubscribes', async () => {
    const subscriberId = await createExtraSubscriber();
    const entry = await db.waitlistEntry.create({
      data: { showtimeId, userId: subscriberId, status: 'NOTICE_QUEUED' },
    });
    entries.push(entry.id);
    const signal = await db.waitlistAvailabilitySignal.create({
      data: { showtimeId, releasedCount: 1, status: 'PROCESSED' },
    });
    signalIds.push(signal.id);
    const notice = await db.waitlistNotification.create({
      data: { entryId: entry.id, signalId: signal.id, status: 'QUEUED' },
    });

    expect(await waitlist.unsubscribe(showtimeId, subscriberId)).toMatchObject({
      unsubscribed: true,
    });
    expect(await db.waitlistNotification.findUniqueOrThrow({ where: { id: notice.id } }))
      .toMatchObject({ status: 'CANCELLED', failureCode: 'UNSUBSCRIBED' });
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } }))
      .toMatchObject({ status: 'CANCELLED' });
  });

  it('suppresses an email if all released seats are bought before delivery validation', async () => {
    const subscriberId = await createExtraSubscriber();
    const entry = await db.waitlistEntry.create({
      data: { showtimeId, userId: subscriberId, status: 'NOTICE_QUEUED' },
    });
    entries.push(entry.id);
    const signal = await db.waitlistAvailabilitySignal.create({
      data: { showtimeId, releasedCount: 1, status: 'PROCESSED' },
    });
    signalIds.push(signal.id);
    const notice = await db.waitlistNotification.create({
      data: { entryId: entry.id, signalId: signal.id, status: 'QUEUED' },
    });
    await db.seat.updateMany({ where: { showtimeId }, data: { isSold: true } });
    const send = vi.spyOn(mail, 'send').mockResolvedValue(undefined);
    try {
      expect(await waitlist.deliverNotification()).toBe(true);
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
    expect(await db.waitlistNotification.findUniqueOrThrow({ where: { id: notice.id } }))
      .toMatchObject({ status: 'CANCELLED', failureCode: 'SEATS_SOLD_BEFORE_NOTICE' });
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } }))
      .toMatchObject({ status: 'ACTIVE' });
  });

  it('rechecks sold seats at the SMTP boundary and cancels a stale notice', async () => {
    const subscriberId = await createExtraSubscriber();
    const entry = await db.waitlistEntry.create({
      data: { showtimeId, userId: subscriberId, status: 'NOTICE_QUEUED' },
    });
    entries.push(entry.id);
    const signal = await db.waitlistAvailabilitySignal.create({
      data: { showtimeId, releasedCount: 1, status: 'PROCESSED' },
    });
    signalIds.push(signal.id);
    const notice = await db.waitlistNotification.create({
      data: { entryId: entry.id, signalId: signal.id, status: 'QUEUED' },
    });
    const seat = await db.seat.findFirstOrThrow({ where: { showtimeId } });
    await db.seat.update({ where: { id: seat.id }, data: { isSold: false } });

    type BoundaryCheck = (noticeId: string, entryId: string, lease: string, showtime: string) => Promise<boolean>;
    const serviceWithBoundary = waitlist as unknown as { validateImmediatelyBeforeSend: BoundaryCheck };
    const originalCheck = serviceWithBoundary.validateImmediatelyBeforeSend.bind(waitlist);
    const boundaryCheck = vi.spyOn(serviceWithBoundary, 'validateImmediatelyBeforeSend').mockImplementation(async (...args) => {
      // Simulate a successful purchase after initial worker validation but before
      // the final pre-SMTP availability query.
      await db.seat.updateMany({ where: { showtimeId }, data: { isSold: true } });
      return originalCheck(...args);
    });
    const send = vi.spyOn(mail, 'send').mockResolvedValue(undefined);
    try {
      expect(await waitlist.deliverNotification()).toBe(true);
      expect(boundaryCheck).toHaveBeenCalledOnce();
      expect(send).not.toHaveBeenCalled();
    } finally {
      boundaryCheck.mockRestore();
      send.mockRestore();
    }
    expect(await db.waitlistNotification.findUniqueOrThrow({ where: { id: notice.id } }))
      .toMatchObject({ status: 'CANCELLED', failureCode: 'SEATS_SOLD_BEFORE_NOTICE' });
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } }))
      .toMatchObject({ status: 'ACTIVE' });
  });

  it('suppresses a queued email after account erasure is approved', async () => {
    const subscriberId = await createExtraSubscriber();
    const entry = await db.waitlistEntry.create({
      data: { showtimeId, userId: subscriberId, status: 'NOTICE_QUEUED' },
    });
    entries.push(entry.id);
    const signal = await db.waitlistAvailabilitySignal.create({
      data: { showtimeId, releasedCount: 1, status: 'PROCESSED' },
    });
    signalIds.push(signal.id);
    const notice = await db.waitlistNotification.create({
      data: { entryId: entry.id, signalId: signal.id, status: 'QUEUED' },
    });
    await privacy.requestErasure(subscriberId);
    await privacy.approveErasure(subscriberId, users[0]!);
    const send = vi.spyOn(mail, 'send').mockResolvedValue(undefined);
    try {
      expect(await waitlist.deliverNotification()).toBe(true);
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
    expect(await db.waitlistNotification.findUniqueOrThrow({ where: { id: notice.id } }))
      .toMatchObject({ status: 'CANCELLED', failureCode: 'RECIPIENT_OR_SHOW_UNAVAILABLE' });
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } }))
      .toMatchObject({ status: 'CANCELLED' });
  });
});
