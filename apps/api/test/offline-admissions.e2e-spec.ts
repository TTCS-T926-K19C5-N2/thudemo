import { assertIntegrationDatabase } from './integration-database.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ScannerCryptoService } from '../src/scanner/scanner-crypto.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';

describe('Signed offline admission transaction and replay', () => {
  let app: INestApplication,
    db: PrismaService,
    show: string,
    event: string,
    order: string;
  let staffA: { id: string; cookie: string },
    staffB: { id: string; cookie: string },
    organizer: { id: string; cookie: string };
  const users: string[] = [],
    gates: string[] = [],
    tickets: string[] = [];
  async function account(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@offline-e2e.test`,
        password: 'isolated-fixture',
        isEmailVerified: true,
        userRoles: { create: { roleId: r.id } },
      },
    });
    users.push(user.id);
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
  beforeAll(async () => {
    assertIntegrationDatabase();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    organizer = await account('ORGANIZER');
    staffA = await account('STAFF');
    staffB = await account('STAFF');
    const buyer = await account('BUYER');
    event = (
      await db.event.create({
        data: {
          name: 'Offline receipt fixture',
          description: 'Synthetic only',
          location: 'Test',
          organizerId: organizer.id,
          status: 'PUBLISHED',
        },
      })
    ).id;
    show = (
      await db.showtime.create({
        data: { eventId: event, startTime: new Date(), status: 'ON_SALE' },
      })
    ).id;
    const category = await db.seatCategory.create({
      data: { showtimeId: show, name: 'TEST', price: 100 },
    });
    for (const [index, actor] of [staffA, staffB].entries()) {
      const gate = await db.checkInGate.create({
        data: { showtimeId: show, name: `Gate${index}` },
      });
      gates.push(gate.id);
      await db.checkInPermission.create({
        data: { gateId: gate.id, userId: actor.id, staffName: `Staff${index}` },
      });
    }
    const seats = [];
    for (let i = 0; i < 4; i++)
      seats.push(
        await db.seat.create({
          data: {
            showtimeId: show,
            categoryId: category.id,
            row: 'E2E',
            seatNumber: i + 1,
          },
        }),
      );
    const created = await db.order.create({
      data: {
        userId: buyer.id,
        eventId: event,
        showtimeId: show,
        status: 'PAID',
        totalAmount: 400,
        paymentExpiresAt: new Date(Date.now() + 600000),
        items: {
          create: seats.map((s) => ({
            seatId: s.id,
            categoryName: 'TEST',
            unitPrice: 100,
          })),
        },
      },
      include: { items: true },
    });
    order = created.id;
    tickets.push(...created.items.map((i) => i.id));
    for (const seat of seats)
      await db.ticket.create({
        data: {
          orderId: order,
          showtimeId: show,
          seatId: seat.id,
          code: randomUUID(),
          seatLabel: `E2E-${seat.seatNumber}`,
          ticketType: 'TEST',
          price: 100,
          status: 'VALID',
        },
      });
  }, 30000);
  function command(index: number, gate = 0, offset = 0) {
    return {
      scanId: randomUUID(),
      ticketCode: tickets[index],
      showtimeId: show,
      gateId: gates[gate],
      deviceId: `offline-device-${gate}`,
      qrPayload: app.get(ScannerCryptoService).issueQr(tickets[index], show),
      scannedAt: new Date(Date.now() - 30000 + offset).toISOString(),
      deviceSentAt: new Date().toISOString(),
      mode: 'offline_admission',
    };
  }
  const sync = (scans: unknown[], cookie = staffA.cookie) =>
    request(app.getHttpServer())
      .post('/scanner/sync-scans')
      .set('Cookie', cookie)
      .send({ scans });
  it('rejects unsigned/malformed commands before creating any receipt', async () => {
    const scan = command(0);
    await sync([{ ...scan, qrPayload: 'legacy' }]).expect(400);
    await sync([{ ...scan, gateId: 'A' }]).expect(400);
    expect(
      await db.offlineScanLog.count({ where: { scanId: scan.scanId } }),
    ).toBe(0);
  });
  it('concurrent identical scanId commits one log and admission and returns same receipt', async () => {
    const scan = command(0),
      responses = await Promise.all([sync([scan]), sync([scan])]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(
      await db.offlineScanLog.count({ where: { scanId: scan.scanId } }),
    ).toBe(1);
    expect(
      await db.ticketAdmission.count({ where: { ticketId: scan.ticketCode } }),
    ).toBe(1);
    await sync([
      { ...scan, scannedAt: new Date(Date.now() - 90000).toISOString() },
    ]).expect(409);
    await db.checkInPermission.delete({
      where: { userId_gateId: { userId: staffA.id, gateId: gates[0] } },
    });
    await sync([scan]).expect(403);
    await db.checkInPermission.create({
      data: { userId: staffA.id, gateId: gates[0], staffName: 'Staff0' },
    });
  });
  it('earlier device observation wins even if it arrives last; replay retains original transport receipt', async () => {
    const late = command(1, 0, 10000),
      early = {
        ...command(1, 1),
        scannedAt: new Date(Date.parse(late.scannedAt) - 10000).toISOString(),
      };
    const ack = await sync([late]).expect(200);
    await sync([early], staffB.cookie).expect(200);
    const winner = await db.ticketAdmission.findFirstOrThrow({
      where: { ticketId: tickets[1], kind: 'NORMAL' },
    });
    expect(winner.requestId).toBe(early.scanId);
    expect(winner.enteredAt.toISOString()).toBe(early.scannedAt);
    expect(
      (
        await db.offlineScanLog.findUniqueOrThrow({
          where: { scanId: late.scanId },
        })
      ).status,
    ).toBe('CONFLICT');
    expect((await sync([late]).expect(200)).body).toEqual(ack.body);
    const report = await request(app.getHttpServer())
      .get(`/scanner/showtimes/${show}/conflicts?page=1`)
      .set('Cookie', organizer.cookie)
      .expect(200);
    expect(report.body.conflicts[0]).toMatchObject({
      ticketCode: tickets[1],
      gateName: 'Gate0',
      winningGate: 'Gate1',
      scannedAt: late.scannedAt,
      winningTime: early.scannedAt,
    });
    expect(typeof report.body.conflicts[0].clockOffsetMs).toBe('number');
  });
  it('snapshot cursor yields cancellation delta with no private or customer data', async () => {
    const get = (cursor = '') =>
      request(app.getHttpServer())
        .get(
          `/scanner/showtimes/${show}/tickets${cursor ? `?since=${cursor}` : ''}`,
        )
        .set('Cookie', staffA.cookie);
    const full = await get().expect(200);
    expect(full.body.mode).toBe('full');
    expect(full.body.tickets).toHaveLength(4);
    expect(JSON.stringify(full.body)).not.toContain('@offline-e2e.test');
    expect(JSON.stringify(full.body)).not.toContain('PRIVATE KEY');
    const unchanged = await get(full.body.cursor).expect(200);
    expect(unchanged.body.tickets).toEqual([]);
    const item = await db.orderItem.findUniqueOrThrow({
      where: { id: tickets[3] },
    });
    await db.ticket.updateMany({
      where: { orderId: order, seatId: item.seatId },
      data: { status: 'CANCELLED' },
    });
    const delta = await get(full.body.cursor).expect(200);
    expect(delta.body.mode).toBe('delta');
    expect(delta.body.tickets).toHaveLength(1);
    expect(delta.body.tickets[0]).toMatchObject({
      code: tickets[3],
      status: 'cancelled',
    });
  });
  afterAll(async () => {
    if (db && show) {
      await db.offlineScanLog.deleteMany({ where: { showtimeId: show } });
      await db.ticketAdmission.deleteMany({ where: { showtimeId: show } });
      await db.checkInPermission.deleteMany({
        where: { gateId: { in: gates } },
      });
      await db.checkInGate.deleteMany({ where: { showtimeId: show } });
      await db.ticket.deleteMany({ where: { showtimeId: show } });
      await db.orderItem.deleteMany({ where: { orderId: order } });
      await db.order.deleteMany({ where: { id: order } });
      await db.seat.deleteMany({ where: { showtimeId: show } });
      await db.seatCategory.deleteMany({ where: { showtimeId: show } });
      await db.showtime.deleteMany({ where: { id: show } });
      await db.event.deleteMany({ where: { id: event } });
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.userRole.deleteMany({ where: { userId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });
});
