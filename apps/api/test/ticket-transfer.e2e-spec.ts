import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TicketsService } from '../src/tickets/tickets.service.js';
import { ScannerCryptoService } from '../src/scanner/scanner-crypto.service.js';
import { ScannerSnapshotService } from '../src/scanner/scanner-snapshot.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { assertIntegrationDatabase } from './integration-database.js';

describe('S57 canonical transfer with real stores', () => {
  let app: INestApplication,
    db: PrismaService,
    eventId: string,
    showId: string,
    gateId: string;
  let buyer: { id: string; email: string; cookie: string },
    recipient: typeof buyer,
    staff: typeof buyer;
  const users: string[] = [];
  let nextSeat = 1;
  async function account(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const u = await db.user.create({
      data: {
        email: `${randomUUID()}@transfer-fixture.invalid`,
        password: 'not-a-login-hash',
        isEmailVerified: true,
        userRoles: { create: { roleId: r.id } },
      },
    });
    users.push(u.id);
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        userId: u.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { id: u.id, email: u.email, cookie: `${SESSION_COOKIE}=${token}` };
  }
  beforeAll(async () => {
    assertIntegrationDatabase();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    buyer = await account('BUYER');
    recipient = await account('BUYER');
    staff = await account('STAFF');
    const e = await db.event.create({
      data: {
        name: 'S57 fixture',
        description: 'Synthetic',
        location: 'Room T',
        organizerId: buyer.id,
      },
    });
    eventId = e.id;
    const s = await db.showtime.create({
      data: {
        eventId,
        startTime: new Date(Date.now() + 3 * 86400000),
        status: 'ON_SALE',
      },
    });
    showId = s.id;
    gateId = (
      await db.checkInGate.create({
        data: { showtimeId: showId, name: 'Transfer gate' },
      })
    ).id;
    await db.checkInPermission.create({
      data: { userId: staff.id, gateId, staffName: 'Fixture staff' },
    });
  });
  afterAll(async () => {
    if (db && eventId) {
      await db.ticketAdmission.deleteMany({ where: { showtimeId: showId } });
      await db.offlineScanLog.deleteMany({ where: { showtimeId: showId } });
      await db.checkInPermission.deleteMany({ where: { gateId } });
      await db.checkInGate.deleteMany({ where: { showtimeId: showId } });
      await db.ticket.deleteMany({ where: { showtimeId: showId } });
      await db.orderItem.deleteMany({
        where: { order: { showtimeId: showId } },
      });
      await db.order.deleteMany({ where: { showtimeId: showId } });
      await db.seat.deleteMany({ where: { showtimeId: showId } });
      await db.seatCategory.deleteMany({ where: { showtimeId: showId } });
      await db.showtime.delete({ where: { id: showId } });
      await db.event.delete({ where: { id: eventId } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
    if (app) {
      await app.get('REDIS_CLIENT').quit();
      await app.close();
    }
  });
  async function paid() {
    const c = await db.seatCategory.create({
      data: { showtimeId: showId, name: `Fixture ${nextSeat}`, price: 100000 },
    });
    const seat = await db.seat.create({
      data: {
        showtimeId: showId,
        categoryId: c.id,
        row: 'T',
        seatNumber: nextSeat++,
        isSold: true,
      },
    });
    const order = await db.order.create({
      data: {
        userId: buyer.id,
        showtimeId: showId,
        status: 'PAID',
        totalAmount: 100000,
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: { seatId: seat.id, categoryName: c.name, unitPrice: 100000 },
        },
      },
      include: { items: { include: { seat: true } } },
    });
    await db.$transaction((tx) =>
      app.get(TicketsService).issueForPaidOrder(tx, order),
    );
    const ticket = await db.ticket.findFirstOrThrow({
      where: { orderId: order.id },
    });
    const view = await request(app.getHttpServer())
      .get(`/orders/${order.id}/tickets`)
      .set('Cookie', buyer.cookie)
      .expect(200);
    return { order, ticket, qr: view.body.tickets[0].qrPayload as string };
  }
  const transfer = (
    order: string,
    ticket: string,
    actor = buyer,
    to = recipient.email,
  ) =>
    request(app.getHttpServer())
      .post(`/orders/${order}/tickets/${ticket}/transfer`)
      .set('Cookie', actor.cookie)
      .send({ toEmail: to });
  const scan = (qrPayload: string) =>
    request(app.getHttpServer())
      .post(`/showtimes/${showId}/check-in`)
      .set('Cookie', staff.cookie)
      .send({ qrPayload, gateId, requestId: randomUUID() });

  it('revokes old canonical QR, exposes the replacement only to its recipient, and keeps financial ownership unchanged', async () => {
    const f = await paid();
    const snapshots = app.get(ScannerSnapshotService);
    const before = await snapshots.snapshot(showId, undefined, {
      id: staff.id,
      roles: ['STAFF'],
    });
    await transfer(f.order.id, f.ticket.id).expect(201);
    const mine = await request(app.getHttpServer())
      .get('/tickets/me')
      .set('Cookie', recipient.cookie)
      .expect(200);
    const received = mine.body.tickets.find(
      (t: { orderId: string }) => t.orderId === f.order.id,
    );
    expect(received).toBeDefined();
    expect(received.qrPayload).not.toBe(f.qr);
    const claims = app.get(ScannerCryptoService).verifyQr(received.qrPayload);
    expect(claims.showtimeId).toBe(showId);
    const oldView = await request(app.getHttpServer())
      .get(`/orders/${f.order.id}/tickets`)
      .set('Cookie', buyer.cookie)
      .expect(200);
    expect(
      oldView.body.tickets.every(
        (t: { qrPayload: string | null }) => t.qrPayload === null,
      ),
    ).toBe(true);
    const revoked = await scan(f.qr);
    expect(revoked.status).not.toBe(200);
    expect(revoked.body.code).toBe('TICKET_CANCELLED');
    const queued = {
      scanId: randomUUID(),
      showtimeId: showId,
      gateId,
      qrPayload: f.qr,
      ticketCode: f.order.items[0].id,
      deviceId: 'transfer-fixture',
      scannedAt: new Date(Date.now() - 10000).toISOString(),
      deviceSentAt: new Date().toISOString(),
      mode: 'offline_admission',
    };
    const sync = () =>
      request(app.getHttpServer())
        .post('/scanner/sync-scans')
        .set('Cookie', staff.cookie)
        .send({ scans: [queued] });
    const ack = await sync().expect(200);
    expect(ack.body.results[0]).toMatchObject({
      status: 'rejected',
      code: 'TICKET_CANCELLED',
    });
    expect((await sync().expect(200)).body).toEqual(ack.body);
    await scan(received.qrPayload).expect(200);
    await transfer(f.order.id, received.id, recipient, buyer.email).expect(400);
    const unchanged = await db.order.findUniqueOrThrow({
      where: { id: f.order.id },
      include: { items: true },
    });
    expect(unchanged.userId).toBe(buyer.id);
    expect(unchanged.totalAmount).toBe(100000);
    expect(unchanged.items).toHaveLength(1);
    const delta = await snapshots.snapshot(showId, before.cursor, {
      id: staff.id,
      roles: ['STAFF'],
    });
    expect(delta.tickets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: f.order.items[0].id,
          status: 'cancelled',
        }),
        expect.objectContaining({
          code: claims.ticketId,
          status: 'checked_in',
        }),
      ]),
    );
    expect(
      await db.ticketAdmission.count({ where: { showtimeId: showId } }),
    ).toBe(1);
  });
  it('allows only one replacement under competing transfers and denies a former owner replay', async () => {
    const f = await paid();
    const results = await Promise.all([
      transfer(f.order.id, f.ticket.id),
      transfer(f.order.id, f.ticket.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    await transfer(f.order.id, f.ticket.id).expect(404);
    expect(
      await db.ticket.count({
        where: { orderId: f.order.id, status: 'VALID' },
      }),
    ).toBe(1);
  });
  it('keeps transfer and admission mutually exclusive under contention', async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const f = await paid();
      const [moved, admitted] = await Promise.all([
        transfer(f.order.id, f.ticket.id),
        scan(f.qr),
      ]);
      expect(moved.status).toBeLessThan(500);
      expect(admitted.status).toBeLessThan(500);
      expect(
        Number(moved.status === 201) + Number(admitted.status === 200),
      ).toBe(1);
      const item = await db.orderItem.findFirstOrThrow({
        where: { orderId: f.order.id },
      });
      const count = await db.ticketAdmission.count({
        where: { ticketId: item.id },
      });
      expect(count).toBe(admitted.status === 200 ? 1 : 0);
      expect(Boolean(item.checkedInAt)).toBe(admitted.status === 200);
    }
  });
});
