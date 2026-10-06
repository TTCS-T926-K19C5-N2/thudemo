import { EventEmitter } from 'node:events';
import { Prisma } from '@prisma/client';
import {
  holdTransaction,
  type HoldConnection,
  type HoldQueryable,
} from './hold-transaction.js';
import { holdStatementNames } from './hold-statement-names.js';
const begin = "BEGIN; SET LOCAL statement_timeout = '10000ms'";

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
});
