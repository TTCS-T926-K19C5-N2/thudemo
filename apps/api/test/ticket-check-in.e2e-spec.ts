import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { AppModule } from '../src/app.module.js';
import { ScannerCryptoService } from '../src/scanner/scanner-crypto.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Ticket check-in integration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let staffCookie: string;
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
        startTime: new Date('2026-12-25T19:00:00Z'),
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
