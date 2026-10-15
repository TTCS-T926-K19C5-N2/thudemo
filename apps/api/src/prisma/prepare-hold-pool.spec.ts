import { prepareHoldPool } from './prepare-hold-pool.js';
import type { HoldConnection } from './hold-transaction.js';

describe('production pool readiness (no product queries)', () => {
  it.each([0, -1, 17, 1.5, NaN, Infinity])(
    'rejects an invalid reserve before connecting (%s)',
    async (count) => {
      const pool = { connect: vi.fn() };
      await expect(prepareHoldPool(pool, count)).rejects.toThrow(
        'Invalid ready connection count',
      );
      expect(pool.connect).not.toHaveBeenCalled();
    },
  );
  it('borrows the ready reserve concurrently and releases every socket once', async () => {
    const clients = Array.from({ length: 16 }, () => ({ release: vi.fn() }));
    let index = 0;
    const pool = {
      connect: vi.fn(async () => clients[index++] as unknown as HoldConnection),
    };
    await prepareHoldPool(pool);
    expect(pool.connect).toHaveBeenCalledTimes(16);
    for (const client of clients) expect(client.release).toHaveBeenCalledOnce();
  });

  it('releases both acquired and late sockets when one connection fails', async () => {
    const first = { release: vi.fn() };
    const late = { release: vi.fn() };
    let resolveLate!: (client: HoldConnection) => void;
    const failure = Error('DB unavailable');
    const pool = {
      connect: vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockRejectedValueOnce(failure)
        .mockReturnValueOnce(
          new Promise<HoldConnection>((resolve) => {
            resolveLate = resolve;
          }),
        ),
    };
    await expect(prepareHoldPool(pool, 3)).rejects.toBe(failure);
    expect(first.release).toHaveBeenCalledOnce();
    resolveLate(late as unknown as HoldConnection);
    await Promise.resolve();
    expect(late.release).toHaveBeenCalledOnce();
  });

  it('uses only one socket for a background worker', async () => {
    const client = { release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    await prepareHoldPool(pool, 1);
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(client.release).toHaveBeenCalledOnce();
  });
});
