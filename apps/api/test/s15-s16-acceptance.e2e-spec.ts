import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { HoldsService } from '../src/holds/holds.service.js';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/auth.service.js';
import { Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { holdTransaction } from '../src/prisma/hold-transaction.js';
import { holdStatementNames } from '../src/prisma/hold-statement-names.js';

type Account = { id: string; cookie: string };
type Category = { id: string; name: string; price: number | null };
type Seat = { id: string; categoryId: string };

describe('S-15 / S-16 Jira acceptance (isolated PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let owner: Account;
  let buyer: Account;
  let otherBuyer: Account;
  let eventId: string | undefined;
  let showId: string;
  let categories: Category[];
  let seats: Seat[];
  const users: string[] = [];
  const prices = [1200000, 650000, 350000];

  async function account(roleName: string): Promise<Account> {
    const role = await db.role.upsert({
      where: { name: roleName },
      create: { name: roleName },
      update: {},
    });
    const user = await db.user.create({
      data: {
        email: `s15-s16-${randomUUID()}@demo.invalid`,
        password: 'isolated-test-fixture-not-login-password',
        isEmailVerified: true,
        userRoles: { create: { roleId: role.id } },
      },
    });
    users.push(user.id);
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { id: user.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  const patchPrices = (
    entries = categories.map((c, i) => ({ id: c.id, price: prices[i] })),
  ) =>
    request(app.getHttpServer())
      .patch(`/showtimes/${showId}/prices`)
      .set('Cookie', owner.cookie)
      .send({ prices: entries });
  const place = (who = buyer) =>
    request(app.getHttpServer())
      .post(`/showtimes/${showId}/orders`)
      .set('Cookie', who.cookie)
      .send({});
  async function openSale() {
    await patchPrices().expect(200);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', owner.cookie)
      .send({ status: 'ON_SALE' })
      .expect(200);
  }
  const hold = (ids: string[], who = buyer) =>
    request(app.getHttpServer())
      .post(`/showtimes/${showId}/holds`)
      .set('Cookie', who.cookie)
      .send({ seatIds: ids });
  async function expectNoOrder() {
    expect(await db.order.count({ where: { showtimeId: showId } })).toBe(0);
    expect(
      await db.orderItem.count({ where: { seat: { showtimeId: showId } } }),
    ).toBe(0);
  }

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (
      target.hostname !== '127.0.0.1' ||
      (target.port !== '15432' &&
        (target.port !== '15434' ||
          process.env.S32_ISOLATED_TEST !== 'true')) ||
      target.pathname !== '/sprint2_integration'
    )
      throw Error(
        'Acceptance tests require the isolated sprint2_integration database on port 15432',
      );
    if ((process.env.HOLD_EXPIRY_MODE ?? 'off') !== 'off')
      throw Error(
        'Disable the automatic expiry worker: these tests control cleanup explicitly',
      );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    owner = await account('ORGANIZER');
    buyer = await account('BUYER');
    otherBuyer = await account('BUYER');
    eventId = (
      await db.event.create({
        data: {
          name: 'S-15 S-16 acceptance fixture',
          description: 'Isolated test data',
          location: 'Test theatre',
          organizerId: owner.id,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    if (!eventId) throw Error('Fixture setup did not complete');
    showId = (
      await db.showtime.create({
        data: { eventId, startTime: new Date(Date.now() + 86400000) },
      })
    ).id;
    const names = ['VIP', 'Tiêu chuẩn', 'Ban công'];
    categories = [];
    for (const name of names)
      categories.push(
        await db.seatCategory.create({ data: { showtimeId: showId, name } }),
      );
    seats = await db.seat.createManyAndReturn({
      data: categories.flatMap((category, i) =>
        [1, 2].map((seatNumber) => ({
          showtimeId: showId,
          categoryId: category.id,
          row: String.fromCharCode(65 + i),
          seatNumber,
        })),
      ),
    });
    await db.showtime.update({
      where: { id: showId },
      data: { seatMapId: showId },
    });
  });

  afterAll(async () => {
    try {
      if (db && eventId) {
        const ids = (
          await db.showtime.findMany({
            where: { eventId },
            select: { id: true },
          })
        ).map((s) => s.id);
        const scope = { showtimeId: { in: ids } };
        await db.orderItem.deleteMany({ where: { order: scope } });
        await db.order.deleteMany({ where: scope });
        await db.seatHold.deleteMany({ where: scope });
        await db.holdSession.deleteMany({ where: scope });
        await db.seat.deleteMany({ where: scope });
        await db.seatCategory.deleteMany({ where: scope });
        await db.showtime.deleteMany({ where: { eventId } });
        await db.event.delete({ where: { id: eventId } });
      }
      if (db && users.length)
        await db.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      if (app) {
        await app.get('REDIS_CLIENT').quit();
        await app.close();
      }
    }
  });

  it('TC-S15-01: saves three category prices and exposes the correct price for every seat', async () => {
    await openSale();
    const map = await request(app.getHttpServer())
      .get(`/showtimes/${showId}/seats`)
      .expect(200);
    expect(map.body).toHaveLength(6);
    for (const [i, category] of categories.entries()) {
      const group = map.body.filter(
        (seat: { category: string }) => seat.category === category.name,
      );
      expect(group).toHaveLength(2);
      expect(
        group.every((seat: { price: number }) => seat.price === prices[i]),
      ).toBe(true);
    }
  });

  it('TC-S15-02: blocks opening a show and names the one category without a price', async () => {
    await patchPrices(
      categories.slice(0, 2).map((c, i) => ({ id: c.id, price: prices[i] })),
    ).expect(200);
    const result = await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', owner.cookie)
      .send({ status: 'ON_SALE' })
      .expect(409);
    expect(result.body.message).toContain('Ban công');
    expect(result.body.message).not.toContain('VIP');
    expect(result.body.message).not.toContain('Tiêu chuẩn');
    expect(
      (await db.showtime.findUniqueOrThrow({ where: { id: showId } })).status,
    ).toBe('DRAFT');
  });

  it.each([-1, 'abc', 1.5, null, 2147483648])(
    'TC-S15-04: rejects invalid price %j without partially saving',
    async (price) => {
      await patchPrices().expect(200);
      await request(app.getHttpServer())
        .patch(`/showtimes/${showId}/prices`)
        .set('Cookie', owner.cookie)
        .send({
          prices: [
            { id: categories[0].id, price: 1500000 },
            { id: categories[1].id, price },
          ],
        })
        .expect(400);
      for (const [i, category] of categories.entries())
        expect(
          (
            await db.seatCategory.findUniqueOrThrow({
              where: { id: category.id },
            })
          ).price,
        ).toBe(prices[i]);
    },
  );

  it('TC-S15-05: accepts zero as a real price instead of treating it as missing', async () => {
    await patchPrices(
      categories.map((c, i) => ({ id: c.id, price: i === 2 ? 0 : prices[i] })),
    ).expect(200);
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', owner.cookie)
      .send({ status: 'ON_SALE' })
      .expect(200);
    const map = await request(app.getHttpServer())
      .get(`/showtimes/${showId}/seats`)
      .expect(200);
    expect(
      map.body
        .filter((seat: { category: string }) => seat.category === 'Ban công')
        .every((seat: { price: number }) => seat.price === 0),
    ).toBe(true);
  });

  it('TC-S15-03: keeps pending-order prices and total unchanged while a new buyer gets the new price', async () => {
    await openSale();
    const vip = seats.filter((s) => s.categoryId === categories[0].id);
    await hold([vip[0].id]).expect(200);
    const old = await place().expect(200);
    await patchPrices([{ id: categories[0].id, price: 1500000 }]).expect(200);
    const read = await request(app.getHttpServer())
      .get(`/orders/${old.body.order.id}`)
      .set('Cookie', buyer.cookie)
      .expect(200);
    expect(read.body.order.items[0].unitPrice).toBe(1200000);
    expect(read.body.order.totalAmount).toBe(1200000);
    await hold([vip[1].id], otherBuyer).expect(200);
    const fresh = await place(otherBuyer).expect(200);
    expect(fresh.body.order.items[0].unitPrice).toBe(1500000);
    expect(fresh.body.order.totalAmount).toBe(1500000);
  });

  it('TC-S16-01: creates exactly the two held seats at server prices and preserves the original hold deadline (DEC-10)', async () => {
    await openSale();
    const selected = [
      seats.find((s) => s.categoryId === categories[0].id)!,
      seats.find((s) => s.categoryId === categories[1].id)!,
    ];
    const held = await hold(selected.map((s) => s.id)).expect(200);
    const result = await request(app.getHttpServer())
      .post(`/showtimes/${showId}/orders`)
      .set('Cookie', buyer.cookie)
      .send({ totalAmount: 0, unitPrice: 0, userId: otherBuyer.id })
      .expect(200);
    expect(result.body.order.status).toBe('PENDING_PAYMENT');
    expect(
      result.body.order.items.map((s: { seatId: string }) => s.seatId).sort(),
    ).toEqual(selected.map((s) => s.id).sort());
    expect(result.body.order.totalAmount).toBe(1850000);
    const deadline = Date.parse(result.body.order.paymentExpiresAt);
    expect(deadline).toBe(Date.parse(held.body.hold.expiresAt));
    expect(deadline - Date.parse(result.body.serverTime)).toBeGreaterThan(0);
    expect(deadline - Date.parse(result.body.serverTime)).toBeLessThanOrEqual(
      600000,
    );
    expect(
      (
        await db.holdSession.findUniqueOrThrow({
          where: { id: held.body.hold.id },
        })
      ).expiresAt.getTime(),
    ).toBe(deadline);
    const claims = await db.seatHold.findMany({
      where: { holdSessionId: held.body.hold.id },
    });
    expect(claims).toHaveLength(2);
    expect(claims.every((s) => s.expiresAt.getTime() === deadline)).toBe(true);
  });

  it('TC-S16-05: refuses an order without a hold', async () => {
    await openSale();
    const result = await place().expect(409);
    expect(result.body.code).toBe('HOLD_REQUIRED');
    await expectNoOrder();
  });

  it('TC-S16-02: refuses the whole order when one of two seat records is expired', async () => {
    await openSale();
    await hold(seats.slice(0, 2).map((s) => s.id)).expect(200);
    await db.seatHold.update({
      where: { seatId: seats[1].id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const result = await place().expect(409);
    expect(result.body.code).toBe('HOLD_EXPIRED');
    expect(result.body.lostSeatIds).toContain(seats[1].id);
    await expectNoOrder();
  });

  it('TC-S16-06 / F-02: refuses the whole order after one expired seat was cleaned up', async () => {
    await openSale();
    await hold(seats.slice(0, 2).map((s) => s.id)).expect(200);
    await db.seatHold.update({
      where: { seatId: seats[1].id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const service = app.get(HoldsService);
    const candidates = (await service.expiredBatch()).filter(
      (s) => s.seatId === seats[1].id,
    );
    expect(await service.cleanupBatch(candidates)).toBe(1);
    const result = await place();
    expect.soft(result.status).toBe(409);
    expect
      .soft(result.body.lostSeatIds)
      .toEqual(expect.arrayContaining([seats[1].id]));
    expect
      .soft(await db.order.count({ where: { showtimeId: showId } }))
      .toBe(0);
  });

  it('TC-S16-07 / F-02: refuses a partial order after the lost seat was reclaimed by another buyer', async () => {
    await openSale();
    await hold(seats.slice(0, 2).map((s) => s.id)).expect(200);
    await db.seatHold.update({
      where: { seatId: seats[1].id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const otherHold = await hold([seats[1].id], otherBuyer).expect(200);
    const result = await place();
    expect.soft(result.status).toBe(409);
    expect
      .soft(result.body.lostSeatIds)
      .toEqual(expect.arrayContaining([seats[1].id]));
    expect
      .soft(await db.order.count({ where: { showtimeId: showId } }))
      .toBe(0);
    expect(
      (await db.seatHold.findUniqueOrThrow({ where: { seatId: seats[1].id } }))
        .holdSessionId,
    ).toBe(otherHold.body.hold.id);
  });

  it('TC-S16-08 / F-01: rechecks expiry after waiting for a database lock', async () => {
    await openSale();
    const held = await hold([seats[0].id]).expect(200);
    let unlock!: () => void;
    let notifyLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      notifyLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM showtimes WHERE id=${showId}::uuid FOR UPDATE`;
        notifyLocked();
        await release;
      },
      { timeout: 10000 },
    );
    let response: Awaited<ReturnType<typeof place>>;
    try {
      await locked;
      const expiresAt = new Date(Date.now() + 1500);
      await db.holdSession.update({
        where: { id: held.body.hold.id },
        data: { expiresAt },
      });
      await db.seatHold.update({
        where: { seatId: seats[0].id },
        data: { expiresAt },
      });
      const placement = place().then((result) => result);
      // Observe an actual lock wait, instead of relying on request scheduling alone.
      const started = Date.now();
      let waiting = false;
      while (Date.now() - started < 3000) {
        const rows = await db.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock'
              AND query LIKE '%FROM showtimes%' AND query LIKE '%FOR SHARE%') AS waiting`;
        if (rows[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      // Always finish the request before asserting or cleaning up its fixtures.
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, expiresAt.getTime() - Date.now() + 200),
        ),
      );
      unlock();
      await blocker;
      response = await placement;
      expect(
        waiting,
        'The order request must actually wait for the held showtime lock',
      ).toBe(true);
    } finally {
      unlock();
      await blocker;
    }
    expect.soft(response.status).toBe(409);
    expect.soft(response.body.code).toBe('HOLD_EXPIRED');
    expect
      .soft(await db.order.count({ where: { showtimeId: showId } }))
      .toBe(0);
  }, 15000);

  it('driver timeout cancels SQL, rolls back partial writes and leaves no pool setting behind', async () => {
    await openSale();
    const held = await hold([seats[0].id]).expect(200);
    const session = await db.holdSession.findUniqueOrThrow({
      where: { id: held.body.hold.id },
    });
    // A one-connection test pool in the already-guarded, isolated integration DB.
    const adapter = await new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    }).connect();
    const pool = adapter.underlyingDriver();
    try {
      await expect(
        holdTransaction(
          pool,
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`UPDATE hold_sessions SET token=${randomUUID()}::uuid WHERE id=${session.id}::uuid RETURNING id`,
            );
            await tx.$queryRaw(Prisma.sql`SELECT pg_sleep(2)`);
          },
          holdStatementNames(),
          { maxWait: 1000, timeout: 100 },
        ),
      ).rejects.toThrow();
      // FOR UPDATE must be available after the server cancels the timed-out SQL.
      const [fresh] = await db.$queryRaw<{ token: string }[]>(
        Prisma.sql`SELECT token FROM hold_sessions WHERE id=${session.id}::uuid FOR UPDATE`,
      );
      expect(fresh.token).toBe(session.token);
      const setting = await pool.query('SHOW statement_timeout');
      expect(setting.rows[0].statement_timeout).toBe('0');
      await place().expect(200);
    } finally {
      await adapter.dispose();
    }
  }, 10000);

  it('TC-S16-03: returns the existing pending order without adding another ten minutes', async () => {
    await openSale();
    await hold([seats[0].id]).expect(200);
    const first = await place().expect(200);
    const second = await place().expect(200);
    expect(first.body.created).toBe(true);
    expect(second.body.created).toBe(false);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(second.body.order.paymentExpiresAt).toBe(
      first.body.order.paymentExpiresAt,
    );
    expect(await db.order.count({ where: { showtimeId: showId } })).toBe(1);
  });

  it('TC-S16-13: adding seats preserves the complete confirmed set and the original hold deadline', async () => {
    await openSale();
    const first = await hold([seats[0].id]).expect(200);
    const added = await hold([seats[1].id]).expect(200);
    expect(added.body.hold.expiresAt).toBe(first.body.hold.expiresAt);
    const session = await db.holdSession.findUniqueOrThrow({
      where: { id: first.body.hold.id },
    });
    expect(session.expectedSeatIds.sort()).toEqual(
      seats
        .slice(0, 2)
        .map((s) => s.id)
        .sort(),
    );
    const order = await place().expect(200);
    expect(
      order.body.order.items.map((s: { seatId: string }) => s.seatId).sort(),
    ).toEqual(session.expectedSeatIds.sort());
  });

  it('TC-S16-14: a new hold token resets the expected seats of the expired round', async () => {
    await openSale();
    const old = await hold(seats.slice(0, 2).map((s) => s.id)).expect(200);
    const oldSession = await db.holdSession.findUniqueOrThrow({
      where: { id: old.body.hold.id },
    });
    await db.holdSession.update({
      where: { id: oldSession.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await db.seatHold.updateMany({
      where: { holdSessionId: oldSession.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const service = app.get(HoldsService);
    await service.cleanupBatch(
      (await service.expiredBatch()).filter((s) =>
        seats.slice(0, 2).some((seat) => seat.id === s.seatId),
      ),
    );
    await hold([seats[2].id]).expect(200);
    const fresh = await db.holdSession.findUniqueOrThrow({
      where: { id: oldSession.id },
    });
    expect(fresh.token).not.toBe(oldSession.token);
    expect(fresh.expectedSeatIds).toEqual([seats[2].id]);
    const order = await place().expect(200);
    expect(
      order.body.order.items.map((s: { seatId: string }) => s.seatId),
    ).toEqual([seats[2].id]);
  });

  it('TC-S16-15: a failed add-seats request rolls back the confirmed-seat snapshot', async () => {
    await openSale();
    const original = await hold([seats[0].id]).expect(200);
    await hold([seats[1].id], otherBuyer).expect(200);
    await hold([seats[1].id, seats[2].id]).expect(409);
    const session = await db.holdSession.findUniqueOrThrow({
      where: { id: original.body.hold.id },
    });
    expect(session.expectedSeatIds).toEqual([seats[0].id]);
    expect(await db.seatHold.count({ where: { seatId: seats[2].id } })).toBe(0);
    const order = await place().expect(200);
    expect(order.body.order.items).toHaveLength(1);
    expect(order.body.order.items[0].seatId).toBe(seats[0].id);
  });

  it('TC-S16-16: parallel first claims merge the confirmed seats without losing either snapshot', async () => {
    await openSale();
    const responses = await Promise.all([
      hold([seats[0].id]).expect(200),
      hold([seats[1].id]).expect(200),
    ]);
    expect(responses[0].body.hold.id).toBe(responses[1].body.hold.id);
    expect(
      responses.some((response) => response.body.hold.seatIds.length === 2),
    ).toBe(true);
    expect(responses[0].body.hold.expiresAt).toBe(
      responses[1].body.hold.expiresAt,
    );
    const session = await db.holdSession.findUniqueOrThrow({
      where: { id: responses[0].body.hold.id },
    });
    expect(session.expectedSeatIds.sort()).toEqual(
      seats
        .slice(0, 2)
        .map((seat) => seat.id)
        .sort(),
    );
    const order = await place().expect(200);
    expect(order.body.order.items).toHaveLength(2);
  });

  it('TC-S16-17: retrying a confirmed claim does not duplicate the snapshot or extend expiry', async () => {
    await openSale();
    const first = await hold([seats[0].id]).expect(200);
    const retried = await hold([seats[0].id]).expect(200);
    expect(retried.body.hold.expiresAt).toBe(first.body.hold.expiresAt);
    const session = await db.holdSession.findUniqueOrThrow({
      where: { id: first.body.hold.id },
    });
    expect(session.expectedSeatIds).toEqual([seats[0].id]);
    const order = await place().expect(200);
    expect(order.body.order.items).toHaveLength(1);
  });

  it('TC-S16-18: a conflicting first claim leaves no session snapshot or partial seat', async () => {
    await openSale();
    await hold([seats[0].id], otherBuyer).expect(200);
    await hold([seats[0].id, seats[1].id]).expect(409);
    expect(
      await db.holdSession.count({
        where: { showtimeId: showId, userId: buyer.id },
      }),
    ).toBe(0);
    expect(await db.seatHold.count({ where: { seatId: seats[1].id } })).toBe(0);
    await place().expect(409);
    await expectNoOrder();
  });

  it('TC-S16-19: adding a new seat does not erase a lost seat from the confirmed snapshot', async () => {
    await openSale();
    const original = await hold(
      seats.slice(0, 2).map((seat) => seat.id),
    ).expect(200);
    await db.seatHold.update({
      where: { seatId: seats[1].id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const service = app.get(HoldsService);
    await service.cleanupBatch(
      (await service.expiredBatch()).filter(
        (seat) => seat.seatId === seats[1].id,
      ),
    );
    await hold([seats[2].id]).expect(200);
    const session = await db.holdSession.findUniqueOrThrow({
      where: { id: original.body.hold.id },
    });
    expect(session.expectedSeatIds.sort()).toEqual(
      seats
        .slice(0, 3)
        .map((seat) => seat.id)
        .sort(),
    );
    const rejected = await place().expect(409);
    expect(rejected.body.lostSeatIds).toEqual([seats[1].id]);
    await expectNoOrder();
  });

  it.each(['closed', 'unpriced', 'unknown-seat'])(
    'TC-S16-20: %s validation writes no session snapshot or claim',
    async (invalid) => {
      await openSale();
      if (invalid === 'closed')
        await db.showtime.update({
          where: { id: showId },
          data: { status: 'CLOSED' },
        });
      if (invalid === 'unpriced')
        await db.seatCategory.update({
          where: { id: categories[0].id },
          data: { price: null },
        });
      await hold([
        invalid === 'unknown-seat' ? randomUUID() : seats[0].id,
      ]).expect(invalid === 'closed' ? 409 : 400);
      expect(
        await db.holdSession.count({ where: { showtimeId: showId } }),
      ).toBe(0);
      expect(await db.seatHold.count({ where: { showtimeId: showId } })).toBe(
        0,
      );
      await expectNoOrder();
    },
  );

  it('Pipelined COMMIT cannot preserve a claim when the bounded routine times out', async () => {
    await openSale();
    const held = await hold([seats[0].id]).expect(200);
    const original = await db.holdSession.findUniqueOrThrow({
      where: { id: held.body.hold.id },
    });
    let unlock!: () => void;
    let notify!: () => void;
    const locked = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM hold_sessions WHERE id=${original.id}::uuid FOR UPDATE`;
        notify();
        await release;
      },
      { timeout: 10000 },
    );
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    });
    const driver = await adapter.connect();
    const pool = driver.underlyingDriver();
    try {
      await locked;
      await expect(
        holdTransaction(
          pool,
          (tx) =>
            tx.$queryRaw(Prisma.sql`
        SELECT * FROM public.claim_hold_v3(${showId}::uuid,${buyer.id}::uuid,
          ${original.sessionHash}::text,${`{${seats[1].id}}`}::uuid[],${randomUUID()}::uuid,${randomUUID()}::uuid)
      `),
          holdStatementNames(),
          { maxWait: 1000, timeout: 100, validatedRoutine: true },
        ),
      ).rejects.toThrow(/transaction expired|statement timeout/);
      const client = await pool.connect();
      try {
        expect(client.pipeline).toBe(false);
        expect(
          (await client.query('SHOW statement_timeout')).rows[0]
            .statement_timeout,
        ).toBe('0');
        expect((await client.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
      } finally {
        client.release();
      }
    } finally {
      unlock();
      await blocker;
      await driver.dispose();
    }
    expect(
      await db.holdSession.findUniqueOrThrow({ where: { id: original.id } }),
    ).toEqual(original);
    expect(
      await db.seatHold.findUnique({ where: { seatId: seats[1].id } }),
    ).toBeNull();
  });

  it('Structured conflict in an autocommit call rolls back every partial write before returning', async () => {
    await openSale();
    const held = await hold([seats[0].id]).expect(200);
    const original = await db.holdSession.findUniqueOrThrow({
      where: { id: held.body.hold.id },
    });
    const ids = [seats[0].id, seats[1].id].sort();
    const [result] = await db.seatReadQuery<
      {
        failure: string;
        rejectedSeatIds: string[];
        id: string | null;
        seatIds: string[];
      }[]
    >(Prisma.sql`SELECT * FROM public.claim_hold_v3(${showId}::uuid,${otherBuyer.id}::uuid,
      ${'standalone-fixture-hash'}::text,${`{${ids.join(',')}}`}::uuid[],${randomUUID()}::uuid,${randomUUID()}::uuid)`);
    expect(result).toMatchObject({
      failure: 'H0004',
      rejectedSeatIds: [seats[0].id],
      id: null,
      seatIds: [],
    });
    expect(
      await db.holdSession.count({
        where: { showtimeId: showId, userId: otherBuyer.id },
      }),
    ).toBe(0);
    expect(
      await db.seatHold.findUnique({ where: { seatId: seats[1].id } }),
    ).toBeNull();
    expect(
      await db.holdSession.findUniqueOrThrow({ where: { id: original.id } }),
    ).toEqual(original);
  });

  it('Hold routine is volatile/invoker and rejects malformed arrays without writes', async () => {
    const [routine] = await db.$queryRaw<
      { volatility: string; definer: boolean }[]
    >`
      SELECT provolatile::text AS volatility,prosecdef AS definer
      FROM pg_proc WHERE oid='public.claim_hold_v3(uuid,uuid,text,uuid[],uuid,uuid)'::regprocedure`;
    expect(routine).toEqual({ volatility: 'v', definer: false });
    for (const value of ['{}', `{${seats[0].id},${seats[0].id}}`, '{NULL}']) {
      await expect(
        db.holdTransaction((tx) =>
          tx.$queryRaw(Prisma.sql`
        SELECT * FROM public.claim_hold_v1(${showId}::uuid,${buyer.id}::uuid,
          ${'fixture-hash'}::text,${value}::uuid[],${randomUUID()}::uuid,${randomUUID()}::uuid)
      `),
        ),
      ).rejects.toMatchObject({ code: '22023' });
    }
    expect(await db.holdSession.count({ where: { showtimeId: showId } })).toBe(
      0,
    );
    expect(await db.seatHold.count({ where: { showtimeId: showId } })).toBe(0);
  });

  it('Hold routine binds all 2000 seats and preserves the original deadline on retry', async () => {
    const extra = await db.seat.createManyAndReturn({
      data: Array.from({ length: 1994 }, (_, i) => ({
        showtimeId: showId,
        categoryId: categories[0].id,
        row: 'L',
        seatNumber: i + 1,
      })),
    });
    await openSale();
    const ids = [...seats, ...extra].map((seat) => seat.id).sort();
    const first = await hold(ids).expect(200);
    expect(first.body.hold.seatIds).toEqual(ids);
    const retry = await hold([...ids].reverse()).expect(200);
    expect(retry.body.hold).toEqual(first.body.hold);
    expect(await db.seatHold.count({ where: { showtimeId: showId } })).toBe(
      2000,
    );
    expect(
      (
        await db.holdSession.findUniqueOrThrow({
          where: { id: first.body.hold.id },
        })
      ).expectedSeatIds,
    ).toEqual(ids);
  });

  it('TC-S16-21: hold confirmation uses a fresh clock after a session lock wait', async () => {
    await openSale();
    const held = await hold([seats[0].id]).expect(200);
    const expiresAt = new Date(Date.now() + 1500);
    await db.holdSession.update({
      where: { id: held.body.hold.id },
      data: { expiresAt },
    });
    await db.seatHold.update({
      where: { seatId: seats[0].id },
      data: { expiresAt },
    });
    let unlock!: () => void;
    let notify!: () => void;
    const locked = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM hold_sessions WHERE id=${held.body.hold.id}::uuid FOR UPDATE`;
        notify();
        await release;
      },
      { timeout: 10000 },
    );
    let response: Awaited<ReturnType<typeof hold>>;
    try {
      await locked;
      const confirmation = hold([seats[0].id]).then((result) => result);
      let waiting = false;
      const started = Date.now();
      while (Date.now() - started < 3000) {
        const [row] = await db.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock'
              AND query LIKE '%public.claim_hold_v3(%') AS waiting`;
        if (row.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, expiresAt.getTime() - Date.now() + 200),
        ),
      );
      unlock();
      await blocker;
      response = await confirmation;
      expect(
        waiting,
        'The hold request must actually wait for the session lock',
      ).toBe(true);
    } finally {
      unlock();
      await blocker;
    }
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HOLD_EXPIRED');
    expect(
      (
        await db.holdSession.findUniqueOrThrow({
          where: { id: held.body.hold.id },
        })
      ).expiresAt,
    ).toEqual(expiresAt);
    await expectNoOrder();
  }, 15000);

  it('Seat-read regression: draft preview still requires the organizer owning the event', async () => {
    const path = `/showtimes/${showId}/manage/seats`;
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', buyer.cookie)
      .expect(403);
    const foreignOwner = await account('ORGANIZER');
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', foreignOwner.cookie)
      .expect(403);
    const preview = await request(app.getHttpServer())
      .get(path)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(preview.body).toHaveLength(6);
    expect(
      preview.body.every(
        (seat: { price: number | null }) => seat.price === null,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(`/showtimes/${showId}/seats`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/showtimes/${randomUUID()}/seats`)
      .expect(404);
  });

  it('Seat-read regression: price, expiry and visibility are read live without owner/token fields', async () => {
    await openSale();
    const seat = seats.find((s) => s.categoryId === categories[0].id)!;
    await hold([seat.id]).expect(200);
    const path = `/showtimes/${showId}/seats`;
    const held = await request(app.getHttpServer()).get(path).expect(200);
    expect(
      held.body.find((s: { id: string }) => s.id === seat.id),
    ).toMatchObject({ price: 1200000, status: 'HELD' });
    expect(Object.keys(held.body[0]).sort()).toEqual(
      ['id', 'row', 'seatNumber', 'category', 'price', 'status'].sort(),
    );
    await db.seatHold.update({
      where: { seatId: seat.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await patchPrices([{ id: categories[0].id, price: 1500000 }]).expect(200);
    const refreshed = await request(app.getHttpServer()).get(path).expect(200);
    expect(
      refreshed.body.find((s: { id: string }) => s.id === seat.id),
    ).toMatchObject({ price: 1500000, status: 'AVAILABLE' });
    await request(app.getHttpServer())
      .patch(`/showtimes/${showId}/status`)
      .set('Cookie', owner.cookie)
      .send({ status: 'CLOSED' })
      .expect(200);
    await request(app.getHttpServer()).get(path).expect(404);
  });

  it('TC-S16-04: concurrent requests across both creation routes produce one order and one copy of each item', async () => {
    await openSale();
    await hold(seats.slice(0, 2).map((s) => s.id)).expect(200);
    const responses = await Promise.all([
      place().expect(200),
      request(app.getHttpServer())
        .post('/orders')
        .set('Cookie', buyer.cookie)
        .send({ showtimeId: showId })
        .expect(201),
    ]);
    expect(responses[0].body.order.id).toBe(responses[1].body.order.id);
    expect(
      responses
        .map((r) => r.body.created)
        .sort((a, b) => Number(a) - Number(b)),
    ).toEqual([false, true]);
    expect(await db.order.count({ where: { showtimeId: showId } })).toBe(1);
    expect(
      await db.orderItem.count({ where: { order: { showtimeId: showId } } }),
    ).toBe(2);
  });
});
