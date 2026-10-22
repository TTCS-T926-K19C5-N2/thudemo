import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { OrderHistoryService } from '../src/orders/order-history.service.js';
import { orderPagination } from '../src/orders/order-pagination.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertOrderHistoryTestDatabase,
  seedOrderHistory,
  cleanupOrderHistory,
  type HistoryFixture,
  type HistoryAccount,
} from './fixtures/order-history.js';

describe('MIP007 S32 history on the integrated candidate', () => {
  let app: INestApplication, db: PrismaService, fixture: HistoryFixture;
  const get = (path: string, who: HistoryAccount = fixture.accounts.a) =>
    request(app.getHttpServer()).get(path).set('Cookie', who.cookie);
  const ids = (orders: { id: string }[]) => orders.map((o) => o.id);
  beforeAll(async () => {
    assertOrderHistoryTestDatabase();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    fixture = await seedOrderHistory(db);
  }, 30000);
  afterAll(async () => {
    try {
      if (fixture) await cleanupOrderHistory(db, fixture);
    } finally {
      if (app) {
        await app.get('REDIS_CLIENT').quit();
        await app.close();
      }
    }
  });
  it('serves bounded private newest-first pages without duplicate tied timestamps or another buyer data', async () => {
    const first = await get(
      `/orders/me?userId=${fixture.accounts.b.id}`,
    ).expect(200);
    const second = await get('/orders/me?page=2').expect(200);
    const expected = fixture.orders
      .filter((o) => o.userId === fixture.accounts.a.id)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : -1),
      )
      .map((o) => o.id);
    expect(first.body.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 14,
      totalPages: 2,
      hasNext: true,
    });
    expect(second.body.orders).toHaveLength(4);
    expect([...ids(first.body.orders), ...ids(second.body.orders)]).toEqual(
      expected,
    );
    expect(
      new Set([...ids(first.body.orders), ...ids(second.body.orders)]).size,
    ).toBe(14);
    expect(
      ids((await get('/orders/me?page=1').expect(200)).body.orders),
    ).toEqual(ids(first.body.orders));
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(first.headers.vary).toContain('Cookie');
    expect(JSON.stringify(first.body)).not.toMatch(
      /userId|sessionHash|tokenHash|holdToken|password|@orders/,
    );
    expect(
      (await get('/orders/me', fixture.accounts.b).expect(200)).body.pagination
        .total,
    ).toBe(3);
  });
  it('returns required403 for another buyer order and status, without content', async () => {
    const other = fixture.orders.find(
      (o) => o.userId === fixture.accounts.b.id,
    )!;
    for (const path of [`/orders/${other.id}`, `/orders/${other.id}/status`]) {
      const denied = await get(path).expect(403);
      expect(denied.body).not.toHaveProperty('order');
    }
    await request(app.getHttpServer()).get('/orders/me').expect(401);
    await get('/orders/me', fixture.accounts.organizer).expect(403);
  });
  it('keeps expired/cancelled records visible and GET never mutates stored order/hold authority', async () => {
    const scope = {
      userId: { in: [fixture.accounts.a.id, fixture.accounts.b.id] },
    };
    const snapshot = async () => ({
      orders: await db.order.findMany({ where: scope, orderBy: { id: 'asc' } }),
      holds: await db.holdSession.findMany({
        where: scope,
        orderBy: { id: 'asc' },
      }),
    });
    const before = await snapshot();
    const all = await get('/orders/me?pageSize=50').expect(200);
    expect(
      new Set(all.body.orders.map((o: { status: string }) => o.status)),
    ).toEqual(
      new Set([
        'PENDING',
        'PENDING_PAYMENT',
        'PAID',
        'CANCELLED',
        'EXPIRED',
        'NEEDS_REVIEW',
      ]),
    );
    const expired = fixture.orders[4];
    const detail = await get(`/orders/${expired.id}`).expect(200);
    expect(detail.body.status).toBe('EXPIRED');
    expect(await snapshot()).toEqual(before);
  });
  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=abc',
    'page=1&page=2',
    'pageSize=51',
    'pageSize=0',
    'page=2147483647&pageSize=50',
  ])('rejects malformed or unbounded pagination %s', async (query) => {
    await get('/orders/me?' + query).expect(400);
  });
  it('returns an explicit bounded empty result and preserves an out-of-range page', async () => {
    const empty = await get('/orders/me', fixture.accounts.empty).expect(200);
    expect(empty.body.orders).toEqual([]);
    expect(empty.body.pagination.total).toBe(0);
    const outside = await get('/orders/me?page=99').expect(200);
    expect(outside.body.orders).toEqual([]);
    expect(outside.body.pagination.page).toBe(99);
  });
  it('uses bounded LIMIT/OFFSET SQL with a fixed batched read count at page sizes1/10/50', async () => {
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
      for (const pageSize of [1, 10, 50]) {
        sql.length = 0;
        const result = await history.list(
          fixture.accounts.a.id,
          orderPagination({ page: '1', pageSize: String(pageSize) }),
        );
        const statements = [...sql];
        expect(
          statements.filter(
            (query) =>
              /SELECT.*"orders"/s.test(query) && /LIMIT.*OFFSET/s.test(query),
          ),
        ).toHaveLength(1);
        expect(
          statements.some((query) => /^(INSERT|UPDATE|DELETE)\b/i.test(query)),
        ).toBe(false);
        expect(result.orders).toHaveLength(Math.min(pageSize, 14));
        runs.push({
          pageSize,
          resultCount: result.orders.length,
          statementCount: statements.length,
          statements,
        });
      }
      expect(runs[0].statementCount).toBe(runs[1].statementCount);
      expect(runs[1].statementCount).toBe(runs[2].statementCount);
      if (process.env.S32_EVIDENCE_DIR) {
        mkdirSync(process.env.S32_EVIDENCE_DIR, { recursive: true });
        writeFileSync(
          resolve(process.env.S32_EVIDENCE_DIR, 'query-shape.json'),
          JSON.stringify(runs, null, 2),
        );
      }
    } finally {
      await client.$disconnect();
    }
  });
});
