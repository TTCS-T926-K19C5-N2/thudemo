import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OrderHistoryService } from '../src/orders/order-history.service.js';
import { orderPagination } from '../src/orders/order-pagination.js';
import { buildMomoSignature } from '../src/payments/gateways/momo-signature.js';
import { MOCK_ACCESS_KEY } from '../src/payments/gateways/mock.gateway.js';
import {
  assertOrderHistoryTestDatabase,
  cleanupOrderHistory,
  seedOrderHistory,
  type HistoryFixture,
  type HistoryAccount,
} from './fixtures/order-history.js';

describe('S-32 order history (real isolated PostgreSQL and session authentication)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let fixture: HistoryFixture;
  const previousGateway = process.env.PAYMENT_GATEWAY;
  const get = (path: string, who: HistoryAccount = fixture.accounts.a) =>
    request(app.getHttpServer()).get(path).set('Cookie', who.cookie);
  const ids = (orders: { id: string }[]) => orders.map((order) => order.id);
  const expected = (who: HistoryAccount) =>
    fixture.orders
      .filter((order) => order.userId === who.id)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : -1),
      )
      .map((order) => order.id);

  beforeAll(async () => {
    assertOrderHistoryTestDatabase();
    process.env.PAYMENT_GATEWAY = 'mock';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    fixture = await seedOrderHistory(db);
  }, 30000);
  afterAll(async () => {
    if (fixture) await cleanupOrderHistory(db, fixture);
    if (app) await app.close();
    if (previousGateway === undefined) delete process.env.PAYMENT_GATEWAY;
    else process.env.PAYMENT_GATEWAY = previousGateway;
  });

  it('A and B only receive their own orders, ignoring client-supplied owner IDs', async () => {
    const a = await get(
      `/orders/me?userId=${fixture.accounts.b.id}&buyerId=${fixture.accounts.b.id}`,
    ).expect(200);
    const b = await get('/orders/me', fixture.accounts.b).expect(200);
    expect(a.body.pagination.total).toBe(14);
    expect(b.body.pagination.total).toBe(3);
    expect(ids(a.body.orders)).toEqual(
      expected(fixture.accounts.a).slice(0, 10),
    );
    expect(ids(b.body.orders)).toEqual(expected(fixture.accounts.b));
    expect(a.headers['cache-control']).toBe('private, no-store');
    expect(a.headers.vary).toContain('Cookie');
    expect(JSON.stringify(a.body)).not.toMatch(
      /userId|holdToken|sessionHash|tokenHash|password|@orders/,
    );
  });

  it('newest first and tied timestamps have stable ID-desc ordering over repeated pages', async () => {
    const first = await get('/orders/me?page=1').expect(200);
    const second = await get('/orders/me?page=2').expect(200);
    const repeated = await get('/orders/me?page=1').expect(200);
    expect(ids(first.body.orders)).toEqual(ids(repeated.body.orders));
    expect([...ids(first.body.orders), ...ids(second.body.orders)]).toEqual(
      expected(fixture.accounts.a),
    );
    expect(first.body.orders).toHaveLength(10);
    expect(second.body.orders).toHaveLength(4);
    expect(first.body.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 14,
      totalPages: 2,
      hasPrevious: false,
      hasNext: true,
    });
    expect(second.body.pagination).toMatchObject({
      page: 2,
      hasPrevious: true,
      hasNext: false,
    });
  });

  it('expired and cancelled orders remain visible, including expiry when cleanup is off', async () => {
    const result = await get('/orders/me?pageSize=50').expect(200);
    expect(
      new Set(
        result.body.orders.map((order: { status: string }) => order.status),
      ),
    ).toEqual(
      new Set([
        'PENDING',
        'PENDING_PAYMENT',
        'PAID',
        'EXPIRED',
        'CANCELLED',
        'NEEDS_REVIEW',
      ]),
    );
    const inferred = fixture.orders[4];
    expect(inferred.status).toBe('PENDING_PAYMENT');
    expect(
      result.body.orders.find(
        (order: { id: string }) => order.id === inferred.id,
      ).status,
    ).toBe('EXPIRED');
    const detail = await get(`/orders/${inferred.id}`).expect(200);
    expect(detail.body.order.status).toBe('EXPIRED');
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: inferred.id } })).status,
    ).toBe('PENDING_PAYMENT');
  });

  it('legacy PENDING uses the shared expiry rule and NEEDS_REVIEW remains a terminal history status', async () => {
    const legacy = fixture.orders.find((order) => order.status === 'PENDING')!;
    const original = await db.order.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    try {
      await db.order.update({
        where: { id: legacy.id },
        data: { paymentExpiresAt: new Date(Date.now() - 1000) },
      });
      const response = await get(`/orders/${legacy.id}`).expect(200);
      expect(response.body.order.status).toBe('EXPIRED');
      expect(response.body.rawStatus).toBe('PENDING');
      expect(
        (await db.order.findUniqueOrThrow({ where: { id: legacy.id } })).status,
      ).toBe('PENDING');
      const review = fixture.orders.find(
        (order) => order.status === 'NEEDS_REVIEW',
      )!;
      expect(
        (await get(`/orders/${review.id}`).expect(200)).body.order.status,
      ).toBe('NEEDS_REVIEW');
    } finally {
      await db.order.update({
        where: { id: legacy.id },
        data: { paymentExpiresAt: original.paymentExpiresAt },
      });
    }
  });

  it('returns the recorded total even when stored line snapshots disagree, without repairing data on GET', async () => {
    const id = fixture.orders[0].id;
    try {
      await db.order.update({ where: { id }, data: { totalAmount: 400000 } });
      expect(
        (await get(`/orders/${id}`).expect(200)).body.order.totalAmount,
      ).toBe(400000);
      const list = await get('/orders/me?pageSize=50').expect(200);
      expect(
        list.body.orders.find((order: { id: string }) => order.id === id)
          .totalAmount,
      ).toBe(400000);
      expect(
        (await db.order.findUniqueOrThrow({ where: { id } })).totalAmount,
      ).toBe(400000);
    } finally {
      await db.order.update({ where: { id }, data: { totalAmount: 500000 } });
    }
  });

  it('the server rejects cross-account detail with exact 403 and no order content', async () => {
    const foreign = fixture.orders.find(
      (order) => order.userId === fixture.accounts.b.id,
    )!;
    const result = await get(`/orders/${foreign.id}`).expect(403);
    expect(result.body).toEqual({
      message: 'Bạn không có quyền xem đơn hàng này.',
      error: 'Forbidden',
      statusCode: 403,
    });
    expect(JSON.stringify(result.body)).not.toContain(foreign.id);
    const status = await get(`/orders/${foreign.id}/status`).expect(403);
    expect(status.body).toEqual(result.body);
    await get(`/orders/${fixture.orders[0].id}`, fixture.accounts.b).expect(
      403,
    );
  });

  it('owned detail includes real event, showtime, seat count and stored line prices', async () => {
    const result = await get(`/orders/${fixture.orders[0].id}`).expect(200);
    expect(result.body.order).toMatchObject({
      seatCount: 2,
      totalAmount: 500000,
      showtime: { event: { name: 'Hòa nhạc mùa thu' } },
    });
    expect(result.body.order.items).toHaveLength(2);
    expect(
      result.body.order.items.every(
        (item: { unitPrice: number; seat: { row: string } }) =>
          item.unitPrice === 250000 && item.seat.row === 'A',
      ),
    ).toBe(true);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.body.order.code).toMatch(/^DH-[0-9A-Z]+$/);
    expect(result.body.order.code).not.toContain('-' + fixture.orders[0].id);
  });

  it('unauthenticated and expired sessions receive 401; admin receives no ownership exception', async () => {
    await request(app.getHttpServer()).get('/orders/me').expect(401);
    await request(app.getHttpServer())
      .get(`/orders/${fixture.orders[0].id}`)
      .expect(401);
    await get('/orders/me', fixture.accounts.admin).expect(403);
    await get(`/orders/${fixture.orders[0].id}`, fixture.accounts.admin).expect(
      403,
    );
    await db.session.updateMany({
      where: { userId: fixture.accounts.empty.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await get('/orders/me', fixture.accounts.empty).expect(401);
    await db.session.updateMany({
      where: { userId: fixture.accounts.empty.id },
      data: { expiresAt: new Date(Date.now() + 600000) },
    });
  });

  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=abc',
    'page=1&page=2',
    'pageSize=0',
    'pageSize=51',
    'pageSize=1000000',
    'pageSize=2.5',
    'page=99999999999999999',
  ])('rejects invalid pagination: %s', async (query) => {
    await get(`/orders/me?${query}`).expect(400);
  });

  it('handles empty and out-of-range pages without loading another buyer or crashing', async () => {
    const empty = await get('/orders/me', fixture.accounts.empty).expect(200);
    expect(empty.body.orders).toEqual([]);
    expect(empty.body.pagination).toMatchObject({
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
    });
    const beyond = await get('/orders/me?page=999').expect(200);
    expect(beyond.body.orders).toEqual([]);
    expect(beyond.body.pagination).toMatchObject({
      page: 999,
      total: 14,
      totalPages: 2,
      hasNext: false,
    });
    await get(`/orders/${randomUUID()}`).expect(404);
    await get('/orders/not-an-id').expect(400);
  });

  it('a later category price change does not change order totals or stored unit prices', async () => {
    const order = fixture.orders[0];
    await db.seatCategory.update({
      where: { id: order.categoryId },
      data: { price: 900000 },
    });
    const detail = await get(`/orders/${order.id}`).expect(200);
    const list = await get('/orders/me').expect(200);
    expect(detail.body.order.totalAmount).toBe(500000);
    expect(
      detail.body.order.items.map(
        (item: { unitPrice: number }) => item.unitPrice,
      ),
    ).toEqual([250000, 250000]);
    expect(
      list.body.orders.find((item: { id: string }) => item.id === order.id)
        .totalAmount,
    ).toBe(500000);
  });

  it('the preserved payment action uses the booked total after live tier prices change (real local mock gateway)', async () => {
    const order = fixture.orders[0];
    await db.seatCategory.update({
      where: { id: order.categoryId },
      data: { price: 900000 },
    });
    const response = await request(app.getHttpServer())
      .post(`/orders/${order.id}/pay`)
      .set('Cookie', fixture.accounts.a.cookie)
      .expect(200);
    const redirect = new URL(response.body.redirectUrl);
    expect(redirect.pathname).toBe('/mock-gateway/pay');
    expect(redirect.searchParams.get('amount')).toBe('500000');
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: response.body.paymentId },
    });
    expect(payment.amount).toBe(500000);
    expect(payment.gateway).toBe('mock');
    const stored = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(stored.totalAmount).toBe(500000);
    expect(stored.paymentExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(stored.status).toBe('PENDING_PAYMENT');
  });

  it('history and detail do not create/update orders or extend/delete holds', async () => {
    const userIds = [fixture.accounts.a.id, fixture.accounts.b.id];
    const snapshot = async () => ({
      orders: await db.order.findMany({
        where: { userId: { in: userIds } },
        orderBy: { id: 'asc' },
      }),
      sessions: await db.holdSession.findMany({
        where: { userId: { in: userIds } },
        orderBy: { id: 'asc' },
      }),
      holds: await db.seatHold.findMany({
        where: { holdSession: { userId: { in: userIds } } },
        orderBy: { seatId: 'asc' },
      }),
    });
    const before = await snapshot();
    await get('/orders/me?page=1').expect(200);
    await get('/orders/me?page=2').expect(200);
    for (const order of fixture.orders.filter(
      (item) => item.userId === fixture.accounts.a.id,
    ))
      await get(`/orders/${order.id}`).expect(200);
    expect(await snapshot()).toEqual(before);
  });

  it('executes bounded SQL and a fixed number of batched reads, not one query per order', async () => {
    const sql: string[] = [];
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      log: [{ emit: 'event', level: 'query' }],
    });
    client.$on('query', (event) => sql.push(event.query));
    try {
      const history = new OrderHistoryService(
        client as unknown as PrismaService,
      );
      const runs = [];
      for (const size of [1, 10, 50]) {
        sql.length = 0;
        const result = await history.list(
          fixture.accounts.a.id,
          orderPagination({ page: '1', pageSize: String(size) }),
        );
        const statements = [...sql];
        expect(
          statements.filter(
            (query) =>
              /SELECT.*"orders"/s.test(query) && /LIMIT.*OFFSET/s.test(query),
          ),
        ).toHaveLength(1);
        expect(
          statements.every(
            (query) => !/^(INSERT|UPDATE|DELETE)\b/i.test(query),
          ),
        ).toBe(true);
        expect(result.orders).toHaveLength(Math.min(size, 14));
        runs.push({
          pageSize: size,
          resultCount: result.orders.length,
          statementCount: statements.length,
          statements,
        });
      }
      expect(runs[0].statementCount).toBe(runs[1].statementCount);
      expect(runs[1].statementCount).toBe(runs[2].statementCount);
      const output = resolve('../../evidence/orders-integration/20261008');
      await mkdir(output, { recursive: true });
      // Parameterized SQL only: never persist query parameters, session cookies or tokens.
      await writeFile(
        resolve(output, 'query-shape.json'),
        JSON.stringify(runs, null, 2),
      );
    } finally {
      await client.$disconnect();
    }
  });

  it('reads an order actually created through the dependency hold/order APIs', async () => {
    const show = await db.showtime.create({
      data: {
        eventId: fixture.eventId,
        startTime: new Date(Date.now() + 86400000),
        status: 'ON_SALE',
      },
    });
    const category = await db.seatCategory.create({
      data: { showtimeId: show.id, name: 'Tiêu chuẩn', price: 320000 },
    });
    const seat = await db.seat.create({
      data: {
        showtimeId: show.id,
        categoryId: category.id,
        row: 'B',
        seatNumber: 1,
      },
    });
    await request(app.getHttpServer())
      .post(`/showtimes/${show.id}/holds`)
      .set('Cookie', fixture.accounts.a.cookie)
      .send({ seatIds: [seat.id] })
      .expect(200);
    const created = await request(app.getHttpServer())
      .post(`/showtimes/${show.id}/orders`)
      .set('Cookie', fixture.accounts.a.cookie)
      .send({ totalAmount: 1, userId: fixture.accounts.b.id })
      .expect(200);
    await db.seatCategory.update({
      where: { id: category.id },
      data: { price: 999999 },
    });
    const detail = await get(`/orders/${created.body.order.id}`).expect(200);
    expect(detail.body.order).toMatchObject({
      status: 'PENDING_PAYMENT',
      seatCount: 1,
      totalAmount: 320000,
    });
    expect(detail.body.order.items[0].unitPrice).toBe(320000);
    const list = await get('/orders/me').expect(200);
    expect(
      list.body.orders.some(
        (item: { id: string }) => item.id === created.body.order.id,
      ),
    ).toBe(true);

    // Preserve the existing payment flow on the current main, using the booked
    // amount through initiation and a signed local mock callback, not live prices.
    const deadline = created.body.order.paymentExpiresAt;
    const payment = await request(app.getHttpServer())
      .post(`/orders/${created.body.order.id}/pay`)
      .set('Cookie', fixture.accounts.a.cookie)
      .send({ amount: 1 })
      .expect(200);
    expect(new URL(payment.body.redirectUrl).searchParams.get('amount')).toBe(
      '320000',
    );
    const payload: Record<string, unknown> = {
      partnerCode: 'MOCK',
      orderId: payment.body.gatewayRef,
      requestId: payment.body.gatewayRef,
      amount: 320000,
      orderInfo: 'Local booking snapshot regression',
      orderType: 'momo_wallet',
      transId: `local-${randomUUID()}`,
      resultCode: 0,
      message: 'Local mock success',
      payType: 'qr',
      responseTime: Date.now(),
      extraData: Buffer.from(
        JSON.stringify({ orderId: created.body.order.id }),
      ).toString('base64'),
    };
    payload.signature = buildMomoSignature(
      payload,
      MOCK_ACCESS_KEY,
      process.env.PAYMENT_WEBHOOK_SECRET ?? 'mock_webhook_secret_dev',
    );
    const callback = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send(payload)
      .expect(200);
    expect(callback.body.status).toBe('PAID');
    const paid = await get(`/orders/${created.body.order.id}`).expect(200);
    expect(paid.body.order.totalAmount).toBe(320000);
    expect(paid.body.order.paymentExpiresAt).toBe(deadline);
    expect(paid.body.latestPayment.status).toBe('SUCCEEDED');
  });
});
