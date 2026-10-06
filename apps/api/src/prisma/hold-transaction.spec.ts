import { EventEmitter } from 'node:events';
import { Prisma } from '@prisma/client';
import {
  holdTransaction,
  type HoldConnection,
  type HoldQueryable,
} from './hold-transaction.js';
import { holdStatementNames } from './hold-statement-names.js';
const begin = "BEGIN; SET LOCAL statement_timeout = '10000ms'";
const validatedBegin =
  begin + "; SET LOCAL plan_cache_mode = 'force_generic_plan'";

function fixture() {
  const events = new EventEmitter();
  const query = vi
    .fn<HoldConnection['query']>()
    .mockResolvedValue({ rows: [] });
  const release = vi.fn();
  const client: HoldConnection = {
    query,
    release,
    on: events.on.bind(events),
    removeListener: events.removeListener.bind(events),
  };
  return {
    client,
    query,
    release,
    events,
    pool: { connect: vi.fn().mockResolvedValue(client) },
  };
}

describe('hold transaction on the existing Prisma pool', () => {
  afterEach(() => vi.useRealTimers());

  it.each([0, -1, NaN, Infinity])(
    'rejects invalid limits before acquiring a connection (%s)',
    async (timeout) => {
      const f = fixture();
      await expect(
        holdTransaction(f.pool, async () => 1, holdStatementNames(), {
          maxWait: 10,
          timeout,
        }),
      ).rejects.toThrow('Invalid hold transaction limits');
      expect(f.pool.connect).not.toHaveBeenCalled();
    },
  );

  it('commits once, parameterizes SQL, names plans and returns typed rows unchanged', async () => {
    const f = fixture();
    const serverTime = new Date();
    const rows = [{ serverTime, seatIds: ['seat-uuid'], valid: 1 }];
    f.query.mockImplementation(async (sql) => ({
      rows: typeof sql === 'string' ? [] : rows,
    }));
    const input = "uuid'; DELETE FROM seats; --";
    const value = await holdTransaction(
      f.pool,
      (tx) =>
        tx.$queryRaw(Prisma.sql`WITH requested AS (SELECT ${input}) SELECT 1`),
      holdStatementNames(),
    );
    expect(value).toBe(rows);
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
      begin,
      {
        text: 'WITH requested AS (SELECT $1) SELECT 1',
        values: [input],
        name: expect.stringMatching(/^holds_[a-f0-9]{48}$/),
      },
      'COMMIT',
    ]);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
    expect(f.events.listenerCount('error')).toBe(0);
  });

  it('rolls back the whole callback before propagating a conflict', async () => {
    const f = fixture();
    const conflict = Error('partial multi-seat claim');
    await expect(
      holdTransaction(
        f.pool,
        async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT ${1}`);
          throw conflict;
        },
        holdStatementNames(),
      ),
    ).rejects.toBe(conflict);
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
      begin,
      { text: 'SELECT $1', values: [1], name: '' },
      'ROLLBACK',
    ]);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('preserves the native ownership constraint error after rollback', async () => {
    const f = fixture();
    const error = Object.assign(Error('database detail'), {
      code: '23505',
      constraint: 'seat_holds_seatId_showtimeId_key',
    });
    f.query.mockRejectedValueOnce(error);
    await expect(
      holdTransaction(f.pool, async () => 1, holdStatementNames()),
    ).rejects.toBe(error);
    expect(f.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('destroys the client when rollback fails, keeping the original error', async () => {
    const f = fixture();
    const conflict = Error('conflict');
    f.query.mockImplementation(async (sql) => {
      if (sql === 'ROLLBACK') throw Error('connection lost');
      return { rows: [] };
    });
    await expect(
      holdTransaction(
        f.pool,
        async () => {
          throw conflict;
        },
        holdStatementNames(),
      ),
    ).rejects.toBe(conflict);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('does not commit after a SQL failure', async () => {
    const f = fixture();
    f.query.mockImplementation(async (sql) => {
      if (typeof sql !== 'string') throw Error('SQL failed');
      return { rows: [] };
    });
    await expect(
      holdTransaction(
        f.pool,
        (tx) => tx.$queryRaw(Prisma.sql`SELECT 1`),
        holdStatementNames(),
      ),
    ).rejects.toThrow('SQL failed');
    expect(f.query.mock.calls.map(([sql]) => sql)).not.toContain('COMMIT');
    expect(f.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('bounds pool wait and returns a late acquisition without running SQL', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let acquire!: (client: HoldConnection) => void;
    f.pool.connect.mockReturnValue(
      new Promise((resolve) => {
        acquire = resolve;
      }),
    );
    const callback = vi.fn();
    const pending = holdTransaction(f.pool, callback, holdStatementNames(), {
      maxWait: 20,
      timeout: 50,
    });
    const assertion = expect(pending).rejects.toThrow('acquisition expired');
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    acquire(f.client);
    await Promise.resolve();
    expect(f.release).toHaveBeenCalledExactlyOnceWith();
    expect(callback).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled();
  });

  it('destroys a running transaction on deadline and rejects later queries', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let tx!: HoldQueryable;
    let finish!: () => void;
    const pending = holdTransaction(
      f.pool,
      async (connection) => {
        tx = connection;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        await tx.$queryRaw(Prisma.sql`SELECT 1`);
      },
      holdStatementNames(),
      { maxWait: 20, timeout: 50 },
    );
    const assertion = expect(pending).rejects.toThrow('transaction expired');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    await expect(tx.$queryRaw(Prisma.sql`SELECT 1`)).rejects.toThrow('closed');
    finish();
    await Promise.resolve();
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN; SET LOCAL statement_timeout = '50ms'",
    ]);
  });

  it('handles a checked-out connection error without an unhandled event', async () => {
    const f = fixture();
    let finish!: () => void;
    const pending = holdTransaction(
      f.pool,
      async () => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
      holdStatementNames(),
    );
    const assertion = expect(pending).rejects.toThrow('connection failed');
    await vi.waitFor(() => expect(f.events.listenerCount('error')).toBe(1));
    f.events.emit('error', Error('backend stopped'));
    await assertion;
    finish();
    await Promise.resolve();
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([begin]);
  });

  it('rejects unsupported parameter conversions and rolls back', async () => {
    const f = fixture();
    await expect(
      holdTransaction(
        f.pool,
        (tx) => tx.$queryRaw(Prisma.sql`SELECT ${new Date()}`),
        holdStatementNames(),
      ),
    ).rejects.toThrow('Unsupported hold parameter type');
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([begin, 'ROLLBACK']);
  });

  it('awaits BEGIN, then submits only server-validated claim and commit together', async () => {
    const f = fixture();
    f.client.pipeline = false;
    let finishBegin!: () => void;
    let finishClaim!: (value: { rows: unknown[] }) => void;
    f.query.mockImplementation((sql) => {
      if (sql === validatedBegin)
        return new Promise((resolve) => {
          finishBegin = () => resolve({ rows: [] });
        });
      if (typeof sql !== 'string')
        return new Promise((resolve) => {
          finishClaim = resolve;
        });
      expect(f.client.pipeline).toBe(true);
      return Promise.resolve({ rows: [] });
    });
    const pending = holdTransaction(
      f.pool,
      (tx) =>
        tx.$queryRaw(Prisma.sql`SELECT * FROM public.claim_hold_v2(${1})`),
      holdStatementNames(),
      { maxWait: 10000, timeout: 10000, validatedRoutine: true },
    );
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledOnce());
    expect(f.query).toHaveBeenCalledWith(validatedBegin);
    expect(f.client.pipeline).toBe(false);
    finishBegin();
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(3));
    expect(f.query).toHaveBeenLastCalledWith('COMMIT');
    expect(f.release).not.toHaveBeenCalled();
    const rows = [{ id: 'fixture-id' }];
    finishClaim({ rows });
    await expect(pending).resolves.toBe(rows);
    expect(f.client.pipeline).toBe(false);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('keeps the routine rejection, drains commit, then rolls back before reuse', async () => {
    const f = fixture();
    f.client.pipeline = false;
    const conflict = Object.assign(Error('server rejected partial claim'), {
      code: 'H0004',
    });
    let finishCommit!: () => void;
    f.query.mockImplementation((sql) => {
      if (typeof sql !== 'string') return Promise.reject(conflict);
      if (sql === 'COMMIT')
        return new Promise((resolve) => {
          finishCommit = () => resolve({ rows: [] });
        });
      return Promise.resolve({ rows: [] });
    });
    const pending = holdTransaction(
      f.pool,
      (tx) =>
        tx.$queryRaw(Prisma.sql`SELECT * FROM public.claim_hold_v2(${1})`),
      holdStatementNames(),
      { maxWait: 10000, timeout: 10000, validatedRoutine: true },
    );
    const assertion = expect(pending).rejects.toBe(conflict);
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(3));
    expect(f.release).not.toHaveBeenCalled();
    finishCommit();
    await assertion;
    expect(f.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(f.client.pipeline).toBe(false);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('avoids an extra rollback round trip only when PostgreSQL acknowledges ROLLBACK', async () => {
    const f = fixture();
    f.client.pipeline = false;
    const conflict = Object.assign(Error('partial claim aborted'), {
      code: 'H0004',
    });
    f.query.mockImplementation(async (sql) => {
      if (typeof sql !== 'string') throw conflict;
      return { rows: [], command: sql === 'COMMIT' ? 'ROLLBACK' : 'BEGIN' };
    });
    await expect(
      holdTransaction(
        f.pool,
        (tx) =>
          tx.$queryRaw(Prisma.sql`SELECT * FROM public.claim_hold_v2(${1})`),
        holdStatementNames(),
        { maxWait: 10000, timeout: 10000, validatedRoutine: true },
      ),
    ).rejects.toBe(conflict);
    expect(f.query.mock.calls.map(([sql]) => sql)).toHaveLength(3);
    expect(f.query).toHaveBeenLastCalledWith('COMMIT');
    expect(f.client.pipeline).toBe(false);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('never enables pipeline or submits a claim/commit when BEGIN fails', async () => {
    const f = fixture();
    f.client.pipeline = false;
    f.query.mockRejectedValueOnce(Error('BEGIN failed'));
    await expect(
      holdTransaction(
        f.pool,
        (tx) =>
          tx.$queryRaw(Prisma.sql`SELECT * FROM public.claim_hold_v2(${1})`),
        holdStatementNames(),
        { maxWait: 10000, timeout: 10000, validatedRoutine: true },
      ),
    ).rejects.toThrow('BEGIN failed');
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
      validatedBegin,
      'ROLLBACK',
    ]);
    expect(f.client.pipeline).toBe(false);
  });

  it('rejects unvalidated SQL without submitting COMMIT in routine mode', async () => {
    const f = fixture();
    await expect(
      holdTransaction(
        f.pool,
        (tx) =>
          tx.$queryRaw(Prisma.sql`SELECT * FROM public.claim_hold_v1(${1})`),
        holdStatementNames(),
        { maxWait: 10000, timeout: 10000, validatedRoutine: true },
      ),
    ).rejects.toThrow('Only the validated hold routine');
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
      validatedBegin,
      'ROLLBACK',
    ]);
  });
});
