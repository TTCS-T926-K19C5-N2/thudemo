import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { AppModule } from '../src/app.module.js';
import { ScannerCryptoService } from '../src/scanner/scanner-crypto.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Ticket check-in integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let staffCookie: string;
  let adminCookie: string;
  let gateId: string;
  let otherGateId: string;
  let otherOrganizerCookie: string;
  let buyerId: string;
  let organizerId: string;
  let showtimeId: string;
  let otherShowtimeId: string;
  let eventId: string;
  let categoryId: string;
  let paidTicketId: string;
  let concurrentTicketId: string;
  let unpaidTicketId: string;
  const userIds: string[] = [];

  async function createAccount(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const roleRecord = await db.role.findUniqueOrThrow({
      where: { name: role },
    });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@check-in-e2e.test`,
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
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  async function createOrderItem(
    seatNumber: number,
    status: OrderStatus,
  ): Promise<string> {
    const seat = await db.seat.create({
      data: {
        showtimeId,
        categoryId,
        row: 'B',
        seatNumber,
      },
    });
    const order = await db.order.create({
      data: {
        userId: buyerId,
        eventId,
        showtimeId,
        status,
        totalAmount: 500000,
        paymentExpiresAt: new Date(Date.now() + 600000),
        expiresAt: new Date(Date.now() + 600000),
        items: {
          create: [
            {
              seatId: seat.id,
              categoryName: 'VIP',
              tierName: 'VIP',
              unitPrice: 500000,
            },
          ],
        },
      },
      select: { items: { select: { id: true } } },
    });
    return order.items[0].id;
  }

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (
      target.hostname !== '127.0.0.1' ||
      !(
        (target.port === '15446' &&
          process.env.SPRINT1_ISOLATED_TEST === 'true' &&
          target.pathname === '/sprint2_integration') ||
        (target.port === '15450' &&
          process.env.SPRINT1_ISOLATED_TEST === 'true' &&
          target.pathname === '/signed_qr_integration') ||
        (target.port === '15432' &&
          target.pathname === '/sprint2_integration') ||
        (target.port === '15438' &&
          target.pathname === '/s31_admission_integration') ||
        (target.port === '15440' &&
          target.pathname === '/signed_qr_integration')
      )
    ) {
      throw new Error('Run only on the isolated sprint2_integration database');
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);

    const organizer = await createAccount('ORGANIZER');
    const otherOrganizer = await createAccount('ORGANIZER');
    const buyer = await createAccount('BUYER');
    const staff = await createAccount('STAFF');
    adminCookie = (await createAccount('ADMIN')).cookie;
    organizerId = organizer.id;
    otherOrganizerCookie = otherOrganizer.cookie;
    buyerId = buyer.id;
    staffCookie = staff.cookie;

    const event = await db.event.create({
      data: {
        name: 'Check-in test',
        description: 'Integration test',
        location: 'Test venue',
        organizerId,
        status: 'PUBLISHED',
      },
    });
    eventId = event.id;

    const showtime = await db.showtime.create({
      data: {
        eventId,
        startTime: new Date(),
        status: 'ON_SALE',
      },
    });
    showtimeId = showtime.id;

    const otherShowtime = await db.showtime.create({
      data: {
        eventId,
        startTime: new Date('2026-12-26T19:00:00Z'),
        status: 'ON_SALE',
      },
    });
    otherShowtimeId = otherShowtime.id;

    const category = await db.seatCategory.create({
      data: { showtimeId, name: 'VIP', price: 500000 },
    });
    categoryId = category.id;
    const gate = await db.checkInGate.create({
      data: { showtimeId, name: 'Cửa A' },
    });
    gateId = gate.id;
    const otherGate = await db.checkInGate.create({
      data: { showtimeId: otherShowtimeId, name: 'Cửa A' },
    });
    otherGateId = otherGate.id;
    await db.checkInPermission.createMany({
      data: [
        { userId: staff.id, gateId, staffName: 'Nhân viên thử nghiệm' },
        {
          userId: staff.id,
          gateId: otherGateId,
          staffName: 'Nhân viên thử nghiệm',
        },
        {
          userId: organizerId,
          gateId,
          staffName: 'Ban tổ chức được phân công',
        },
      ],
    });
    paidTicketId = await createOrderItem(1, OrderStatus.PAID);
    concurrentTicketId = await createOrderItem(2, OrderStatus.PAID);
    unpaidTicketId = await createOrderItem(3, OrderStatus.PENDING_PAYMENT);
  }, 30000);

  afterAll(async () => {
    if (db && eventId) {
      const showtimeIds = [showtimeId, otherShowtimeId].filter(Boolean);
      await db.ticketAdmission.deleteMany({
        where: { showtimeId: { in: showtimeIds } },
      });
      await db.checkInPermission.deleteMany({
        where: { gate: { showtimeId: { in: showtimeIds } } },
      });
      await db.checkInGate.deleteMany({
        where: { showtimeId: { in: showtimeIds } },
      });
      await db.orderItem.deleteMany({
        where: { order: { showtimeId: { in: showtimeIds } } },
      });
      await db.payment.deleteMany({
        where: { order: { showtimeId: { in: showtimeIds } } },
      });
      await db.order.deleteMany({
        where: { showtimeId: { in: showtimeIds } },
      });
      await db.seat.deleteMany({ where: { showtimeId: { in: showtimeIds } } });
      await db.seatCategory.deleteMany({
        where: { showtimeId: { in: showtimeIds } },
      });
      await db.showtime.deleteMany({ where: { eventId } });
      await db.event.deleteMany({ where: { id: eventId } });
    }
    if (db && userIds.length) {
      await db.userAdminAudit.deleteMany({
        where: { targetUserId: { in: userIds } },
      });
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('checks in a paid ticket and returns the seat and database time', async () => {
    const response = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send({
        gateId,
        qrPayload: app
          .get(ScannerCryptoService)
          .issueQr(paidTicketId, showtimeId),
      })
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'SUCCESS',
      ticketId: paidTicketId,
      seat: { category: 'VIP', row: 'B', number: 1, label: 'B-1' },
    });
    expect(Number.isFinite(Date.parse(response.body.checkedInAt))).toBe(true);
    const stored = await db.orderItem.findUniqueOrThrow({
      where: { id: paidTicketId },
    });
    expect(stored.checkedInAt?.toISOString()).toBe(response.body.checkedInAt);
  });

  it('rejects unknown QR codes, tickets from another showtime, and unpaid tickets', async () => {
    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send({
        gateId,
        qrPayload: app
          .get(ScannerCryptoService)
          .issueQr(randomUUID(), showtimeId),
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/showtimes/${otherShowtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send({
        gateId: otherGateId,
        qrPayload: app
          .get(ScannerCryptoService)
          .issueQr(concurrentTicketId, showtimeId),
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send({
        gateId,
        qrPayload: app
          .get(ScannerCryptoService)
          .issueQr(unpaidTicketId, showtimeId),
      })
      .expect(404);
  });

  it('lists only today shows with an explicit gate grant', async () => {
    const unassigned = await db.showtime.create({
      data: { eventId, startTime: new Date(), status: 'ON_SALE' },
    });
    try {
      const response = await request(app.getHttpServer())
        .get('/check-in/today')
        .set('Cookie', staffCookie)
        .expect(200);
      expect(response.body.map((s: { id: string }) => s.id)).toEqual([
        showtimeId,
      ]);
    } finally {
      await db.showtime.delete({ where: { id: unassigned.id } });
    }
  });

  it('admin creates staff, grants gates, records an explained exception and revokes the old session grant', async () => {
    const password = 'fixture-local-only-password';
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Cookie', adminCookie)
      .send({
        email: `${randomUUID()}@check-in-e2e.test`,
        password,
        role: 'STAFF',
      })
      .expect(201);
    userIds.push(created.body.id);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: created.body.email, password })
      .expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const path = `/admin/users/${created.body.id}/assignment`;
    const grant = {
      showtimeId,
      gateName: 'Cửa A',
      canOverride: false,
      enabled: true,
    };
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', staffCookie)
      .send(grant)
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', adminCookie)
      .send({ ...grant, showtimeId: 'malformed' })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', adminCookie)
      .send(grant)
      .expect(201);
    const gates = await request(app.getHttpServer())
      .get(`/showtimes/${showtimeId}/check-in/gates`)
      .set('Cookie', cookie)
      .expect(200);
    expect(gates.body.gates.map((g: { gateId: string }) => g.gateId)).toEqual([
      gateId,
    ]);
    const ticketId = await createOrderItem(100, OrderStatus.PAID);
    const qrPayload = app
      .get(ScannerCryptoService)
      .issueQr(ticketId, showtimeId);
    const first = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', cookie)
      .send({ qrPayload, gateId })
      .expect(200);
    const gateB = await request(app.getHttpServer())
      .post(path)
      .set('Cookie', adminCookie)
      .send({ ...grant, gateName: 'Cửa B', canOverride: true })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', cookie)
      .send({ qrPayload, gateId: gateB.body.gateId })
      .expect(409);
    expect(second.body.firstAdmission).toEqual({
      checkedInAt: first.body.checkedInAt,
      gateName: 'Cửa A',
    });
    expect(second.body.canOverride).toBe(true);
    const exception = {
      qrPayload,
      gateId: gateB.body.gateId,
      reason: 'Đã đối chiếu chủ vé thử nghiệm',
      ownerConfirmed: true,
    };
    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in/exception`)
      .set('Cookie', cookie)
      .send({ ...exception, reason: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in/exception`)
      .set('Cookie', cookie)
      .send(exception)
      .expect(200);
    const records = await db.ticketAdmission.findMany({
      where: { ticketId },
      orderBy: { enteredAt: 'asc' },
    });
    expect(records.map((r) => r.kind)).toEqual(['NORMAL', 'EXCEPTION']);
    expect(records[1]).toMatchObject({
      staffId: created.body.id,
      gateId: gateB.body.gateId,
      reason: exception.reason,
      ownerConfirmed: true,
    });
    expect(
      (
        await db.orderItem.findUniqueOrThrow({ where: { id: ticketId } })
      ).checkedInAt?.toISOString(),
    ).toBe(first.body.checkedInAt);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', adminCookie)
      .send({ ...grant, gateName: 'Cửa B', enabled: false })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in/exception`)
      .set('Cookie', cookie)
      .send(exception)
      .expect(403);
    expect(
      await db.userAdminAudit.count({
        where: { targetUserId: created.body.id, action: 'REVOKE_GATE' },
      }),
    ).toBe(1);
  });

  it('returns and logs distinct wrong-show, cancelled, unknown and unsigned reasons without admitting', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const cancelledId = await createOrderItem(99, OrderStatus.PAID);
    const item = await db.orderItem.findUniqueOrThrow({
      where: { id: cancelledId },
    });
    const cancelledAt = new Date('2026-10-18T10:00:00Z');
    await db.ticket.create({
      data: {
        orderId: item.orderId,
        showtimeId,
        seatId: item.seatId,
        code: randomUUID(),
        seatLabel: 'B-99',
        ticketType: 'VIP',
        status: 'CANCELLED',
        cancelledAt,
      },
    });
    const crypto = app.get(ScannerCryptoService);
    const cases = [
      {
        qrPayload: crypto.issueQr(cancelledId, showtimeId),
        expected: 'TICKET_CANCELLED',
        text: '18/10/2026',
      },
      {
        qrPayload: crypto.issueQr(randomUUID(), showtimeId),
        expected: 'UNKNOWN_TICKET',
        text: 'Không phải vé của hệ thống',
      },
      {
        qrPayload: 'not-a-system-qr',
        expected: 'INVALID_QR_SIGNATURE',
        text: 'Không phải vé của hệ thống',
      },
      {
        qrPayload: crypto.issueQr(randomUUID(), otherShowtimeId),
        expected: 'WRONG_SHOWTIME',
        text: 'Check-in test',
      },
    ];
    try {
      const count = await db.ticketAdmission.count({ where: { showtimeId } });
      for (const entry of cases) {
        const response = await request(app.getHttpServer())
          .post(`/showtimes/${showtimeId}/check-in`)
          .set('Cookie', staffCookie)
          .send({ gateId, qrPayload: entry.qrPayload });
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.body.code).toBe(entry.expected);
        expect(response.body.message).toContain(entry.text);
        expect(
          warn.mock.calls.some(
            ([message]) =>
              typeof message === 'string' &&
              message.includes(`"reasonCode":"${entry.expected}"`),
          ),
        ).toBe(true);
      }
      expect(await db.ticketAdmission.count({ where: { showtimeId } })).toBe(
        count,
      );
      expect(
        (await db.orderItem.findUniqueOrThrow({ where: { id: cancelledId } }))
          .checkedInAt,
      ).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects a second scan and allows only one concurrent check-in', async () => {
    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send({
        gateId,
        qrPayload: app
          .get(ScannerCryptoService)
          .issueQr(paidTicketId, showtimeId),
      })
      .expect(409);

    const scan = () =>
      request(app.getHttpServer())
        .post(`/showtimes/${showtimeId}/check-in`)
        .set('Cookie', staffCookie)
        .send({
          gateId,
          qrPayload: app
            .get(ScannerCryptoService)
            .issueQr(concurrentTicketId, showtimeId),
        });
    const responses = await Promise.all([scan(), scan()]);

    expect(
      responses
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 409]);
    const stored = await db.orderItem.findUniqueOrThrow({
      where: { id: concurrentTicketId },
    });
    expect(stored.checkedInAt).toBeInstanceOf(Date);
  });

  it('requires staff roles plus explicit showtime/gate grants, including organizers', async () => {
    const organizerToken = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(organizerToken),
        userId: organizerId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .send({
        gateId,
        qrPayload: app
          .get(ScannerCryptoService)
          .issueQr(paidTicketId, showtimeId),
      })
      .expect(401);

    const organizerTicketId = await createOrderItem(4, OrderStatus.PAID);
    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', otherOrganizerCookie)
      .send({
        gateId,
        qrPayload: app
          .get(ScannerCryptoService)
          .issueQr(organizerTicketId, showtimeId),
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', `${SESSION_COOKIE}=${organizerToken}`)
      .send({
        gateId,
        qrPayload: app
          .get(ScannerCryptoService)
          .issueQr(organizerTicketId, showtimeId),
      })
      .expect(200);
  });
});
