import { assertIntegrationDatabase } from './integration-database.js';
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
  let staffId: string;
  let gateId: string;
  let secondGateId: string;
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

  async function createOfflineTicket(seatNumber: number): Promise<string> {
    const itemId = await createOrderItem(seatNumber, OrderStatus.PAID);
    const item = await db.orderItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { order: true },
    });
    await db.ticket.create({
      data: {
        orderId: item.orderId,
        showtimeId,
        seatId: item.seatId,
        code: `OFFLINE-${randomUUID()}`,
        seatLabel: `B-${seatNumber}`,
        ticketType: 'VIP',
        status: 'VALID',
        price: 500000,
      },
    });
    return itemId;
  }

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
    assertIntegrationDatabase();

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
    staffId = staff.id;

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
    const secondGate = await db.checkInGate.create({
      data: { showtimeId, name: 'Cửa B' },
    });
    secondGateId = secondGate.id;
    const otherGate = await db.checkInGate.create({
      data: { showtimeId: otherShowtimeId, name: 'Cửa A' },
    });
    otherGateId = otherGate.id;
    await db.checkInPermission.createMany({
      data: [
        { userId: staff.id, gateId, staffName: 'Nhân viên thử nghiệm' },
        {
          userId: staff.id,
          gateId: secondGateId,
          staffName: 'Nhân viên thử nghiệm',
        },
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
      await db.offlineScanLog.deleteMany({
        where: { showtimeId: { in: showtimeIds } },
      });
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

  it('INT-05: replays admission idempotently, reports first gate, and records an authorized exception', async () => {
    const itemId = await createOrderItem(8, OrderStatus.PAID);
    const qrPayload = app.get(ScannerCryptoService).issueQr(itemId, showtimeId);
    const normalRequestId = randomUUID();
    const normalCommand = { gateId, requestId: normalRequestId, qrPayload };
    const first = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send(normalCommand)
      .expect(200);
    expect(first.body).toMatchObject({ status: 'SUCCESS', kind: 'NORMAL', gateName: 'Cửa A' });
    const firstAdmission = await db.ticketAdmission.findFirstOrThrow({
      where: { ticketId: itemId, kind: 'NORMAL' },
    });

    const replay = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send(normalCommand)
      .expect(200);
    expect(replay.body.status).toBe('ALREADY_RECORDED');
    const duplicate = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in`)
      .set('Cookie', staffCookie)
      .send({ gateId: secondGateId, requestId: randomUUID(), qrPayload })
      .expect(409);
    expect(duplicate.body).toMatchObject({
      code: 'TICKET_ALREADY_CHECKED_IN',
      firstAdmission: { gateName: 'Cửa A', checkedInAt: firstAdmission.enteredAt.toISOString() },
      canOverride: false,
    });
    expect(await db.ticketAdmission.count({ where: { ticketId: itemId, kind: 'NORMAL' } })).toBe(1);

    await db.checkInPermission.update({
      where: { userId_gateId: { userId: staffId, gateId: secondGateId } },
      data: { canOverride: true },
    });
    const exceptionRequestId = randomUUID();
    const exceptionCommand = {
      gateId: secondGateId, requestId: exceptionRequestId, qrPayload,
      ownerConfirmed: true, reason: 'Đã kiểm tra chủ vé tại cửa B',
    };
    const exception = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in/exception`)
      .set('Cookie', staffCookie)
      .send(exceptionCommand)
      .expect(200);
    expect(exception.body).toMatchObject({ status: 'EXCEPTION_RECORDED', kind: 'EXCEPTION', gateName: 'Cửa B' });
    const exceptionRow = await db.ticketAdmission.findFirstOrThrow({
      where: { ticketId: itemId, kind: 'EXCEPTION' },
    });
    expect(exceptionRow).toMatchObject({ reason: exceptionCommand.reason, staffId, staffName: 'Nhân viên thử nghiệm', ownerConfirmed: true });
    expect(exceptionRow.enteredAt.getTime()).toBeGreaterThanOrEqual(firstAdmission.enteredAt.getTime());
    const exceptionReplay = await request(app.getHttpServer())
      .post(`/showtimes/${showtimeId}/check-in/exception`)
      .set('Cookie', staffCookie)
      .send(exceptionCommand)
      .expect(200);
    expect(exceptionReplay.body.status).toBe('ALREADY_RECORDED');
    expect(await db.ticketAdmission.count({ where: { ticketId: itemId } })).toBe(2);
    const manifestPath = process.env.AI_REMEDIATION_PROFILE_MANIFEST;
    if (manifestPath) {
      const { writeFileSync } = await import('node:fs');
      const { dirname, resolve } = await import('node:path');
      writeFileSync(resolve(dirname(manifestPath), 'int05-admission-oracle.json'), JSON.stringify({
        runId: process.env.AI_REMEDIATION_RUN_ID,
        fixture: { showtimeId, ticketItemId: itemId },
        oracle: {
          normalCount: await db.ticketAdmission.count({ where: { ticketId: itemId, kind: 'NORMAL' } }),
          exceptionCount: await db.ticketAdmission.count({ where: { ticketId: itemId, kind: 'EXCEPTION' } }),
          firstAdmission: { gateName: firstAdmission.gateName, enteredAt: firstAdmission.enteredAt.toISOString() },
          exception: { gateName: exceptionRow.gateName, staffName: exceptionRow.staffName, reason: exceptionRow.reason, ownerConfirmed: exceptionRow.ownerConfirmed },
          normalReplay: replay.body.status, exceptionReplay: exceptionReplay.body.status,
          admissionCountAfterReplay: await db.ticketAdmission.count({ where: { ticketId: itemId } }),
        },
      }, null, 2));
    }
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

  it('commits an offline scan once and returns the durable receipt on retry', async () => {
    const ticketId = await createOfflineTicket(5);
    const scanId = randomUUID();
    const scannedAt = new Date('2026-10-23T04:00:00.000Z').toISOString();
    const command = {
      scanId,
      showtimeId,
      gateId,
      ticketCode: ticketId,
      qrPayload: app.get(ScannerCryptoService).issueQr(ticketId, showtimeId),
      deviceId: 'fixture-device-0001',
      scannedAt,
      deviceSentAt: new Date('2026-10-23T04:00:01.000Z').toISOString(),
      mode: 'offline_admission',
    };
    const sync = () =>
      request(app.getHttpServer())
        .post('/scanner/sync-scans')
        .set('Cookie', staffCookie)
        .send({ scans: [command] })
        .expect(200);

    const first = await sync();
    const retry = await sync();
    expect(first.body.results[0]).toMatchObject({
      scanId,
      ticketCode: ticketId,
      status: 'synced',
    });
    expect(retry.body.results).toEqual(first.body.results);
    expect(
      await db.ticketAdmission.count({ where: { ticketId, kind: 'NORMAL' } }),
    ).toBe(1);
    expect(await db.offlineScanLog.count({ where: { scanId } })).toBe(1);
    expect(
      (await db.orderItem.findUniqueOrThrow({ where: { id: ticketId } }))
        .checkedInAt,
    ).toEqual(new Date(scannedAt));
  });

  it('keeps the earlier device scan when a later scan uploads first', async () => {
    const ticketId = await createOfflineTicket(6);
    const signedQr = app
      .get(ScannerCryptoService)
      .issueQr(ticketId, showtimeId);
    const makeScan = (
      deviceId: string,
      scanIdGate: string,
      seconds: number,
      sentAt: string,
    ) => ({
      scanId: randomUUID(),
      showtimeId,
      gateId: scanIdGate,
      ticketCode: ticketId,
      qrPayload: signedQr,
      deviceId,
      scannedAt: new Date(
        `2026-10-23T04:01:${String(seconds).padStart(2, '0')}.000Z`,
      ).toISOString(),
      deviceSentAt: new Date(sentAt).toISOString(),
      mode: 'offline_admission',
    });
    const a = makeScan(
      'fixture-device-0002',
      gateId,
      10,
      '2026-10-23T04:02:30.000Z',
    );
    const b = makeScan(
      'fixture-device-0003',
      secondGateId,
      20,
      '2026-10-23T03:58:00.000Z',
    );
    const upload = (scan: typeof a) =>
      request(app.getHttpServer())
        .post('/scanner/sync-scans')
        .set('Cookie', staffCookie)
        .send({ scans: [scan] })
        .expect(200);

    await upload(b);
    await upload(a);
    expect(
      await db.ticketAdmission.count({ where: { ticketId, kind: 'NORMAL' } }),
    ).toBe(1);
    const admission = await db.ticketAdmission.findFirstOrThrow({
      where: { ticketId, kind: 'NORMAL' },
    });
    expect(admission.requestId).toBe(a.scanId);
    expect(admission.enteredAt).toEqual(new Date(a.scannedAt));
    expect(admission.gateId).toBe(a.gateId);
    expect(
      await db.offlineScanLog.count({ where: { ticketCode: ticketId } }),
    ).toBe(2);
    expect(
      await db.offlineScanLog.count({
        where: { ticketCode: ticketId, status: 'CONFLICT' },
      }),
    ).toBe(1);
    expect(
      await db.offlineScanLog.findUniqueOrThrow({
        where: { scanId: b.scanId },
      }),
    ).toMatchObject({ status: 'CONFLICT' });
    expect(
      await db.offlineScanLog.findUniqueOrThrow({
        where: { scanId: a.scanId },
      }),
    ).toMatchObject({ status: 'ACCEPTED' });
    const [aLog, bLog] = await Promise.all([
      db.offlineScanLog.findUniqueOrThrow({ where: { scanId: a.scanId } }),
      db.offlineScanLog.findUniqueOrThrow({ where: { scanId: b.scanId } }),
    ]);
    expect(aLog.clockOffsetMs).not.toBe(bLog.clockOffsetMs);
  });
});
