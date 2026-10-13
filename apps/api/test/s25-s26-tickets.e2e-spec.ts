import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { AppModule } from '../src/app.module.js';
import { ScannerCryptoService } from '../src/scanner/scanner-crypto.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type TicketBody = {
  ticketId: string;
  showtimeId: string;
  eventName: string;
  startTime: string;
  seatLabel: string;
  category: string;
  tier: string | null;
  status: string;
  qrPayload: string;
};

// ConfigService falls back to process.env, which holds the suite's signing key;
// this keeps a verifier or rotated issuer limited to the keys given here.
const isolatedConfig = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

// S-25 (phát vé QR sau thanh toán) và S-26 (QR có chữ ký) theo AC trên Jira.
describe('S-25/S-26 signed QR tickets', () => {
  let app: INestApplication;
  let db: PrismaService;
  let crypto: ScannerCryptoService;
  let buyerId: string;
  let buyerCookie: string;
  let otherBuyerCookie: string;
  let eventId: string;
  let showtimeId: string;
  let categoryId: string;
  let paidOrderId: string;
  let unpaidOrderId: string;
  const startTime = new Date('2026-12-24T12:30:00Z');
  const userIds: string[] = [];
  let seatNumber = 0;

  async function createAccount(role: string) {
    await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
    const roleRecord = await db.role.findUniqueOrThrow({
      where: { name: role },
    });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@s25-s26-e2e.test`,
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

  async function createOrder(status: OrderStatus, seats: number) {
    const seatIds: string[] = [];
    for (let i = 0; i < seats; i++) {
      const seat = await db.seat.create({
        data: { showtimeId, categoryId, row: 'C', seatNumber: ++seatNumber },
      });
      seatIds.push(seat.id);
    }
    const order = await db.order.create({
      data: {
        userId: buyerId,
        eventId,
        showtimeId,
        status,
        totalAmount: 300000 * seats,
        paymentExpiresAt: new Date(Date.now() + 600000),
        expiresAt: new Date(Date.now() + 600000),
        items: {
          create: seatIds.map((seatId) => ({
            seatId,
            categoryName: 'Thường',
            tierName: 'Mở bán sớm',
            unitPrice: 300000,
          })),
        },
      },
    });
    return order.id;
  }

  async function paidTickets(): Promise<TicketBody[]> {
    const response = await request(app.getHttpServer())
      .get(`/orders/${paidOrderId}/tickets`)
      .set('Cookie', buyerCookie)
      .expect(200);
    return (response.body as { tickets: TicketBody[] }).tickets;
  }

  function editOneChar(qr: string, index: number) {
    const replacement = qr[index] === 'a' ? 'b' : 'a';
    return qr.slice(0, index) + replacement + qr.slice(index + 1);
  }

  function expectRejected(verifier: ScannerCryptoService, qr: unknown) {
    expect(() => verifier.verifyQr(qr)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'INVALID_QR_SIGNATURE' }),
      }) as Error,
    );
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
    crypto = app.get(ScannerCryptoService);

    const organizer = await createAccount('ORGANIZER');
    const buyer = await createAccount('BUYER');
    const otherBuyer = await createAccount('BUYER');
    buyerId = buyer.id;
    buyerCookie = buyer.cookie;
    otherBuyerCookie = otherBuyer.cookie;

    const event = await db.event.create({
      data: {
        name: 'Đêm nhạc S-25',
        description: 'Integration test',
        location: 'Test venue',
        organizerId: organizer.id,
        status: 'PUBLISHED',
      },
    });
    eventId = event.id;
    const showtime = await db.showtime.create({
      data: { eventId, startTime, status: 'ON_SALE' },
    });
    showtimeId = showtime.id;
    const category = await db.seatCategory.create({
      data: { showtimeId, name: 'Thường', price: 300000 },
    });
    categoryId = category.id;

    paidOrderId = await createOrder(OrderStatus.PAID, 3);
    unpaidOrderId = await createOrder(OrderStatus.PENDING_PAYMENT, 1);
  }, 30000);

  afterAll(async () => {
    if (db && eventId) {
      await db.orderItem.deleteMany({ where: { order: { showtimeId } } });
      await db.payment.deleteMany({ where: { order: { showtimeId } } });
      await db.order.deleteMany({ where: { showtimeId } });
      await db.seat.deleteMany({ where: { showtimeId } });
      await db.seatCategory.deleteMany({ where: { showtimeId } });
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

  it('AC1: đơn đã trả có mỗi ghế một vé riêng với QR, tên sự kiện, suất, hạng và số ghế', async () => {
    const tickets = await paidTickets();
    expect(tickets).toHaveLength(3);
    expect(tickets.map((ticket) => ticket.seatLabel)).toEqual([
      'C-1',
      'C-2',
      'C-3',
    ]);
    for (const ticket of tickets) {
      expect(ticket).toMatchObject({
        showtimeId,
        eventName: 'Đêm nhạc S-25',
        startTime: startTime.toISOString(),
        category: 'Thường',
        tier: 'Mở bán sớm',
        status: 'VALID',
      });
      expect(crypto.verifyQr(ticket.qrPayload)).toMatchObject({
        ticketId: ticket.ticketId,
        showtimeId,
      });
    }
  });

  it('AC2: ba ghế có ba QR khác nhau và không suy ra được mã vé khác', async () => {
    const tickets = await paidTickets();
    expect(new Set(tickets.map((ticket) => ticket.qrPayload)).size).toBe(3);
    expect(new Set(tickets.map((ticket) => ticket.ticketId)).size).toBe(3);
    // Mã vé là UUID ngẫu nhiên, không phải số thứ tự.
    for (const ticket of tickets)
      expect(ticket.ticketId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
    // Thay mã vé trong QR của vé này bằng mã vé khác thì chữ ký không còn khớp.
    const [first, second] = tickets;
    const forged = first.qrPayload.replace(first.ticketId, second.ticketId);
    expect(forged).not.toBe(second.qrPayload);
    expectRejected(crypto, forged);
  });

  it('AC3: đơn chưa trả mở trang vé bằng đường dẫn thì không có vé nào', async () => {
    const response = await request(app.getHttpServer())
      .get(`/orders/${unpaidOrderId}/tickets`)
      .set('Cookie', buyerCookie)
      .expect(409);
    expect(response.body).toMatchObject({ code: 'TICKETS_NOT_READY' });
    expect(response.body).not.toHaveProperty('tickets');
    expect(JSON.stringify(response.body)).not.toContain('ET1.');

    // Đơn của người khác cũng không lộ vé.
    await request(app.getHttpServer())
      .get(`/orders/${paidOrderId}/tickets`)
      .set('Cookie', otherBuyerCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/orders/${paidOrderId}/tickets`)
      .expect(401);
  });

  it('AC4: QR gồm mã vé, mã suất và chữ ký; vé thật qua, sửa một ký tự bị từ chối', async () => {
    const [ticket] = await paidTickets();
    const parts = ticket.qrPayload.split('.');
    expect(parts).toHaveLength(6);
    expect(parts[3]).toBe(showtimeId);
    expect(parts[4]).toBe(ticket.ticketId);

    // Máy quét chỉ có khóa công khai vẫn xác minh được.
    const scanner = new ScannerCryptoService(
      isolatedConfig({
        SCANNER_KEY_ID: crypto.getKeyId(),
        SCANNER_PUBLIC_KEYS: JSON.stringify(
          Object.fromEntries(
            crypto.getPublicKeys().map(({ keyId, key }) => [keyId, key]),
          ),
        ),
      }),
    );
    expect(() => scanner.issueQr(ticket.ticketId, showtimeId)).toThrow();
    expect(scanner.verifyQr(ticket.qrPayload).ticketId).toBe(ticket.ticketId);
    // Sửa một ký tự ở mã suất, mã vé hoặc chữ ký đều bị từ chối.
    const showtimeStart = ticket.qrPayload.indexOf(showtimeId);
    const ticketStart = ticket.qrPayload.indexOf(ticket.ticketId);
    for (const index of [
      showtimeStart,
      ticketStart,
      ticket.qrPayload.length - 10,
    ])
      expectRejected(scanner, editOneChar(ticket.qrPayload, index));
  });

  it('AC5: đổi khóa ký thì vé đã phát trước đó vẫn hợp lệ nhờ phiên bản khóa trong QR', async () => {
    const [ticket] = await paidTickets();
    const oldKeyId = crypto.getKeyId();
    const next = generateKeyPairSync('ed25519');
    const ring = Object.fromEntries(
      crypto.getPublicKeys().map(({ keyId, key }) => [keyId, key]),
    );
    const rotated = new ScannerCryptoService(
      isolatedConfig({
        SCANNER_KEY_ID: 's25-rotated',
        SCANNER_SIGNING_PRIVATE_KEY: next.privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        SCANNER_PUBLIC_KEYS: JSON.stringify({
          ...ring,
          's25-rotated': next.publicKey
            .export({ type: 'spki', format: 'pem' })
            .toString(),
        }),
      }),
    );
    expect(ticket.qrPayload.split('.')[2]).toBe(oldKeyId);
    expect(rotated.verifyQr(ticket.qrPayload).keyId).toBe(oldKeyId);
    const reissued = rotated.issueQr(ticket.ticketId, showtimeId);
    expect(rotated.verifyQr(reissued).keyId).toBe('s25-rotated');
  });

  it('AC6: QR tự tạo với mã vé hợp lệ nhưng không có chữ ký thì bị từ chối', async () => {
    const [ticket] = await paidTickets();
    const unsigned = ticket.qrPayload.split('.').slice(0, 5).join('.');
    expectRejected(crypto, unsigned);
    expectRejected(crypto, `${unsigned}.`);
    expectRejected(crypto, ticket.ticketId);
    // Chữ ký do khóa lạ tạo ra cũng không được chấp nhận.
    const attacker = generateKeyPairSync('ed25519');
    const fakeSignature = sign(
      null,
      Buffer.from(unsigned, 'ascii'),
      attacker.privateKey,
    ).toString('base64url');
    expectRejected(crypto, `${unsigned}.${fakeSignature}`);
  });
});
