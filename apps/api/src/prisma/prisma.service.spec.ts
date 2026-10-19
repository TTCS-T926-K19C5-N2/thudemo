import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

describe('shared session and hold read connection ownership', () => {
  function fixture() {
    const db = new PrismaService(
      new ConfigService({
        DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/unused',
      }),
    );
    vi.spyOn(db, '$connect').mockResolvedValue();
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ value: 1 }] }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ value: 2 }] }),
      connect: vi.fn().mockResolvedValue(client),
    };
    (db as unknown as { holdAdapter: { pool: unknown } }).holdAdapter.pool =
      pool;
    return { db, client, pool };
  }
  afterEach(() => vi.restoreAllMocks());
  it('uses the owned connection without acquiring/releasing another pool slot', async () => {
    const { db, client, pool } = fixture();
    expect(
      await db.seatReadQuery(
        Prisma.sql`SELECT ${'fixture'}::text`,
        client as never,
      ),
    ).toEqual([{ value: 1 }]);
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
    expect(client.release).not.toHaveBeenCalled();
    expect(client.query.mock.calls[0][0]).toMatchObject({
      text: 'SELECT $1::text',
      values: ['fixture'],
    });
  });
  it('keeps ordinary reads on pool.query when no connection is owned', async () => {
    const { db, pool } = fixture();
    expect(await db.seatReadQuery(Prisma.sql`SELECT ${2}`)).toEqual([
      { value: 2 },
    ]);
    expect(pool.query).toHaveBeenCalledOnce();
  });
  it('propagates a quota read error while preserving caller release ownership', async () => {
    const { db, client, pool } = fixture();
    client.query.mockRejectedValueOnce(Error('connection unavailable'));
    await expect(
      db.seatReadQuery(Prisma.sql`SELECT ${1}`, client as never),
    ).rejects.toThrow('connection unavailable');
    expect(client.release).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
  it('rejects nonprimitive bindings before accessing the database', async () => {
    const { db, pool } = fixture();
    await expect(
      db.seatReadQuery(Prisma.sql`SELECT ${{ arbitrary: 'object' }}`),
    ).rejects.toThrow('Unsupported seat read parameter type');
    expect(db.$connect).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
  it('releases a session request connection exactly once after finish and close', async () => {
    const { db, client, pool } = fixture();
    const originalRelease = client.release;
    const listeners = new Map<string, () => void>();
    const request: Parameters<PrismaService['sessionQuery']>[1] = {
      res: {
        once: (name, callback) => {
          listeners.set(name, callback);
        },
      },
    };
    expect(await db.sessionQuery(Prisma.sql`SELECT ${1}`, request)).toEqual([
      { value: 1 },
    ]);
    expect(request.holdClient).toBe(client);
    listeners.get('finish')!();
    listeners.get('close')!();
    request.releaseHoldClient!();
    expect(originalRelease).toHaveBeenCalledOnce();
    expect(request.holdClient).toBeUndefined();
    expect(pool.connect).toHaveBeenCalledOnce();
  });
  it('releases a failed session lookup without waiting for response completion', async () => {
    const { db, client } = fixture();
    const release = client.release;
    client.query.mockRejectedValueOnce(Error('session query unavailable'));
    const request: Parameters<PrismaService['sessionQuery']>[1] = {
      res: { once: () => {} },
    };
    await expect(
      db.sessionQuery(Prisma.sql`SELECT ${1}`, request),
    ).rejects.toThrow('session query unavailable');
    expect(release).toHaveBeenCalledOnce();
    expect(request.holdClient).toBeUndefined();
  });
});
