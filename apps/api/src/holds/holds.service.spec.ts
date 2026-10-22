import {
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HoldConnection } from '../prisma/hold-transaction.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HoldsService, parseTicketLimit } from './holds.service.js';

describe('hold driver error translation', () => {
  const seatId = '00000000-0000-4000-8000-000000000001';
  afterEach(() => vi.restoreAllMocks());

  function service(constraint: string, code = '23505') {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const db = {
      commitHoldRoutine: vi
        .fn()
        .mockRejectedValue(
          Object.assign(Error('private database detail'), { code, constraint }),
        ),
      seatReadQuery: vi.fn().mockResolvedValue([{ seatId }]),
    };
    return {
      db,
      warn,
      holds: new HoldsService(db as unknown as PrismaService),
    };
  }

  it('translates only the known ownership unique constraint after rollback', async () => {
    const { db, warn, holds } = service('seat_holds_seatId_showtimeId_key');
    try {
      await holds.claim(seatId, seatId, 'fixture-session-hash', {
        seatIds: [seatId],
      });
      expect.fail('Expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SEAT_CONFLICT',
        rejectedSeatIds: [seatId],
      });
      expect(
        JSON.stringify((error as ConflictException).getResponse()),
      ).not.toContain('private database detail');
    }
    expect(db.seatReadQuery).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each([
    ['different_constraint', '23505'],
    ['seat_holds_seatId_showtimeId_key', '08006'],
    ['missing_routine', '42883'],
  ])(
    'fails closed for unexpected constraint/code %s/%s',
    async (constraint, code) => {
      const { db, holds } = service(constraint, code);
      await expect(
        holds.claim(seatId, seatId, 'fixture-session-hash', {
          seatIds: [seatId],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOLD_UNAVAILABLE' }),
      });
      // One S-42 limit lookup, then fail closed without an ownership re-query.
      expect(db.seatReadQuery).toHaveBeenCalledOnce();
    },
  );

  it('requests retry rather than falsely reporting a conflict when ownership already changed', async () => {
    const { db, holds } = service('seat_holds_seatId_showtimeId_key');
    db.seatReadQuery.mockResolvedValue([]);
    await expect(
      holds.claim(seatId, seatId, 'fixture-session-hash', {
        seatIds: [seatId],
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    ['H0001', 404, undefined],
    ['H0002', 409, 'SHOWTIME_CLOSED'],
    ['H0003', 400, undefined],
    ['H0004', 409, 'SEAT_CONFLICT'],
    ['H0005', 409, 'HOLD_EXPIRED'],
  ])(
    'maps server validation %s to the existing HTTP contract without DB details',
    async (code, status, apiCode) => {
      const { db, holds } = service('routine', code);
      db.commitHoldRoutine.mockRejectedValue(
        Object.assign(Error('private database detail'), {
          code,
          detail: JSON.stringify([seatId]),
        }),
      );
      try {
        await holds.claim(seatId, seatId, 'fixture-session-hash', {
          seatIds: [seatId],
        });
        expect.fail('Expected server rejection');
      } catch (error) {
        expect(error).toMatchObject({ status });
        expect(JSON.stringify(error)).not.toContain('private database detail');
        if (apiCode)
          expect(error).toMatchObject({
            response: expect.objectContaining({ code: apiCode }),
          });
      }
      // One S-42 limit lookup; mapped routine rejections never re-query.
      expect(db.seatReadQuery).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['H0001', 404, undefined],
    ['H0002', 409, 'SHOWTIME_CLOSED'],
    ['H0003', 400, undefined],
    ['H0004', 409, 'SEAT_CONFLICT'],
    ['H0005', 409, 'HOLD_EXPIRED'],
    ['H0006', 503, 'HOLD_RETRY'],
  ])(
    'maps rolled-back routine outcome %s without a native database exception',
    async (failure, status, code) => {
      const { db, holds } = service('unused');
      db.commitHoldRoutine.mockResolvedValue([
        {
          failure,
          rejectedSeatIds: [seatId],
          id: null,
          expiresAt: null,
          seatIds: [],
          serverTime: new Date(),
        },
      ]);
      const expected = code
        ? { status, response: expect.objectContaining({ code }) }
        : { status };
      await expect(
        holds.claim(seatId, seatId, 'fixture-session-hash', {
          seatIds: [seatId],
        }),
      ).rejects.toMatchObject(expected);
      // One S-42 limit lookup; routine outcomes never re-query ownership.
      expect(db.seatReadQuery).toHaveBeenCalledOnce();
    },
  );

  it.each(['not-json', '["private database detail"]', '[]'])(
    'fails closed for an invalid conflict detail %s',
    async (detail) => {
      const { db, holds } = service('routine', 'H0004');
      db.commitHoldRoutine.mockRejectedValue(
        Object.assign(Error('private database detail'), {
          code: 'H0004',
          detail,
        }),
      );
      await expect(
        holds.claim(seatId, seatId, 'fixture-session-hash', {
          seatIds: [seatId],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOLD_UNAVAILABLE' }),
      });
      expect(db.seatReadQuery).toHaveBeenCalledOnce();
    },
  );
});

describe('S-42 per-account ticket limit', () => {
  const showtimeId = '00000000-0000-4000-8000-000000000001';
  const userId = '00000000-0000-4000-8000-000000000002';
  const seatA = '00000000-0000-4000-8000-000000000011';
  afterEach(() => vi.restoreAllMocks());

  function fixture(
    limit: number | null,
    held: string | bigint,
    bought: string | bigint,
  ) {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const db = {
      seatReadQuery: vi
        .fn()
        .mockResolvedValueOnce([{ maxTicketsPerUser: limit }])
        .mockResolvedValue([{ held, bought }]),
      commitHoldRoutine: vi.fn().mockResolvedValue([
        {
          serverTime: new Date(),
          id: 'hold-id',
          expiresAt: new Date(Date.now() + 600000),
          seatIds: [seatA],
          failure: null,
          rejectedSeatIds: [],
        },
      ]),
    };
    return { db, holds: new HoldsService(db as unknown as PrismaService) };
  }

  it.each([
    [{ maxTicketsPerUser: null }, null],
    [{}, null],
    [{ maxTicketsPerUser: 1 }, 1],
    [{ maxTicketsPerUser: 2000 }, 2000],
  ])('accepts %j as %j', (body, expected) => {
    expect(parseTicketLimit(body)).toBe(expected);
  });

  const statusOf = (fn: () => unknown): unknown => {
    try {
      fn();
    } catch (error) {
      return (error as { status?: unknown }).status;
    }
    return undefined;
  };

  it.each([[0], [-1], [2001], [1.5], ['5'], [[]]])(
    'rejects invalid limit value %j with 400',
    (maxTicketsPerUser) => {
      expect(statusOf(() => parseTicketLimit({ maxTicketsPerUser }))).toBe(400);
    },
  );

  it('rejects non-object bodies with 400', () => {
    expect(statusOf(() => parseTicketLimit(null))).toBe(400);
    expect(statusOf(() => parseTicketLimit([1]))).toBe(400);
  });

  it('maps the transactional database quota outcome to TICKET_LIMIT', async () => {
    const { db, holds } = fixture(2, '1', 1n);
    db.commitHoldRoutine.mockResolvedValueOnce([
      {
        failure: 'H0007',
        rejectedSeatIds: [seatA],
        serverTime: new Date(),
        id: null,
        expiresAt: null,
        seatIds: [],
      },
    ] as never);
    await expect(
      holds.claim(showtimeId, userId, 'fixture-session-hash', {
        seatIds: [seatA],
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: 'TICKET_LIMIT',
      }),
    });
    expect(db.commitHoldRoutine).toHaveBeenCalledOnce();
  });

  it('allows a claim that exactly reaches the limit', async () => {
    const { db, holds } = fixture(2, '1', '0');
    const state = await holds.claim(
      showtimeId,
      userId,
      'fixture-session-hash',
      {
        seatIds: [seatA],
      },
    );
    expect(state.hold?.seatIds).toEqual([seatA]);
    expect(db.commitHoldRoutine).toHaveBeenCalledOnce();
  });

  it('skips counting when the showtime has no limit', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const db = {
      seatReadQuery: vi.fn().mockResolvedValue([{ maxTicketsPerUser: null }]),
      commitHoldRoutine: vi.fn().mockResolvedValue([
        {
          serverTime: new Date(),
          id: 'hold-id',
          expiresAt: new Date(Date.now() + 600000),
          seatIds: [seatA],
          failure: null,
          rejectedSeatIds: [],
        },
      ]),
    };
    const holds = new HoldsService(db as unknown as PrismaService);
    const body = { seatIds: [seatA] };
    await holds.claim(showtimeId, userId, 'fixture-session-hash', body);
    await holds.claim(showtimeId, userId, 'fixture-session-hash', body);
    // Limit lookup runs once per TTL window; counting never runs.
    expect(db.seatReadQuery).toHaveBeenCalledOnce();
    expect(db.commitHoldRoutine).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });

  const limitQueryCount = (db: {
    seatReadQuery: { mock: { calls: unknown[][] } };
  }) =>
    db.seatReadQuery.mock.calls.filter((args: unknown[]) => {
      const first = args[0] as { text?: unknown };
      return (
        typeof first.text === 'string' &&
        first.text.includes('maxTicketsPerUser')
      );
    }).length;

  it.each([null, 4])(
    'reuses each occupied request connection for cold quota reads (limit %s)',
    async (limit) => {
      const { db, holds } = fixture(limit, '0', '0');
      const clients = Array.from(
        { length: 10 },
        () => ({ release: vi.fn() }) as unknown as HoldConnection,
      );
      db.seatReadQuery
        .mockReset()
        .mockImplementation(
          async (sql: { text: string }, client: HoldConnection) => {
            // All ten slots are held by authenticated requests. A second acquisition
            // would never complete; quota reads must use one of the owned connections.
            if (!clients.includes(client))
              throw Error('Would wait on exhausted pool');
            await new Promise((done) => setImmediate(done));
            return sql.text.includes('maxTicketsPerUser')
              ? [{ maxTicketsPerUser: limit }]
              : [{ held: '0', bought: '0' }];
          },
        );
      const results = await Promise.all(
        clients.map((client, index) =>
          holds.claim(
            showtimeId,
            `user-${index}`,
            'fixture-session-hash',
            { seatIds: [seatA] },
            client,
          ),
        ),
      );
      expect(results).toHaveLength(10);
      expect(limitQueryCount(db)).toBe(1);
      expect(db.seatReadQuery).toHaveBeenCalledTimes(1);
      for (const client of clients)
        expect(client.release).not.toHaveBeenCalled();
      for (const [index, args] of db.commitHoldRoutine.mock.calls.entries())
        expect(args[1]).toBe(clients[index]);
    },
  );

  it('refetches the limit after the cache TTL expires', async () => {
    const { db, holds } = fixture(null, '0', '0');
    (holds as unknown as { limitCacheTtlMs: number }).limitCacheTtlMs = 0;
    const body = { seatIds: [seatA] };
    await holds.claim(showtimeId, userId, 'fixture-session-hash', body);
    await holds.claim(showtimeId, userId, 'fixture-session-hash', body);
    expect(limitQueryCount(db)).toBe(2);
  });

  it('singleflights concurrent cold-cache lookups into one query', async () => {
    const { db, holds } = fixture(4, '0', '0');
    // One deferred limit row shared by 20 concurrent claims (cold container
    // hit by a burst must not flood the hold pool with lookups).
    let release!: (rows: unknown[]) => void;
    db.seatReadQuery.mockReset();
    db.seatReadQuery.mockImplementationOnce(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = resolve;
        }),
    );
    db.seatReadQuery.mockImplementation(async (sql: { text: string }) =>
      sql.text.includes('maxTicketsPerUser')
        ? [{ maxTicketsPerUser: 4 }]
        : [{ held: '0', bought: '0' }],
    );
    const pending = Array.from({ length: 20 }, (_, i) =>
      holds.claim(showtimeId, `user-${i}`, 'fixture-session-hash', {
        seatIds: [seatA],
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    release([{ maxTicketsPerUser: 4 }]);
    await Promise.all(pending);
    expect(limitQueryCount(db)).toBe(1);
    expect(db.commitHoldRoutine.mock.calls).toHaveLength(20);
  });

  it('fails closed when the limit lookup errors so the limit is never bypassed', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const db = {
      seatReadQuery: vi.fn().mockRejectedValueOnce(new Error('db down')),
      commitHoldRoutine: vi.fn().mockResolvedValue([
        {
          serverTime: new Date(),
          id: 'hold-id',
          expiresAt: new Date(Date.now() + 600000),
          seatIds: [seatA],
          failure: null,
          rejectedSeatIds: [],
        },
      ]),
    };
    const holds = new HoldsService(db as unknown as PrismaService);
    await expect(
      holds.claim(showtimeId, userId, 'fixture-session-hash', {
        seatIds: [seatA],
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(db.commitHoldRoutine).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
});
