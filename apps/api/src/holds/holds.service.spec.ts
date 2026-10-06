import {
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { HoldsService } from './holds.service.js';

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
    expect(db.seatReadQuery).toHaveBeenCalledOnce();
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
      expect(db.seatReadQuery).not.toHaveBeenCalled();
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
      expect(db.seatReadQuery).not.toHaveBeenCalled();
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
    },
  );
});
