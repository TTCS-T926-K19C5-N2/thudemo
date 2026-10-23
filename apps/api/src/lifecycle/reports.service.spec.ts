import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { allocateCouponDiscount, ReportsService } from './reports.service.js';

describe('allocateCouponDiscount', () => {
  it('allocates proportional floors and assigns remainder by ascending ticket code', () => {
    const result = allocateCouponDiscount(
      [
        { code: 'T-C', unitPrice: 1 },
        { code: 'T-A', unitPrice: 1 },
        { code: 'T-B', unitPrice: 1 },
      ],
      2,
    );
    expect([...result.entries()].sort()).toEqual([
      ['T-A', 1],
      ['T-B', 1],
      ['T-C', 0],
    ]);
    expect([...result.values()].reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  it('preserves exact totals for unequal ticket prices and full discounts', () => {
    const result = allocateCouponDiscount(
      [
        { code: 'T-B', unitPrice: 2 },
        { code: 'T-A', unitPrice: 1 },
      ],
      2,
    );
    expect(result).toEqual(new Map([['T-B', 1], ['T-A', 1]]));
    expect([...allocateCouponDiscount([{ code: 'T-A', unitPrice: 1 }, { code: 'T-B', unitPrice: 2 }], 3).values()])
      .toEqual([1, 2]);
  });

  it('rejects invalid totals and duplicate ticket codes', () => {
    expect(() => allocateCouponDiscount([{ code: 'T-A', unitPrice: 10 }], 11)).toThrow();
    expect(() => allocateCouponDiscount([{ code: 'T-A', unitPrice: 10 }, { code: 'T-A', unitPrice: 10 }], 1)).toThrow();
  });
});

describe('ReportsService.holdConversion', () => {
  const showtimeId = '10000000-0000-4000-8000-000000000001';
  const from = '2026-10-01T00:00:00.000Z';
  const to = '2026-10-08T00:00:00.000Z';
  let db: any;
  let service: ReportsService;
  const owner = { id: 'organizer-1', roles: ['ORGANIZER'] } as any;

  beforeEach(() => {
    db = {
      showtime: { findUnique: vi.fn().mockResolvedValue({ event: { organizerId: owner.id } }) },
      $queryRaw: vi.fn().mockResolvedValue([{
        started: 10, orderCreated: 5, paid: 3, expired: 2, cancelled: 0,
        pendingAtCutoff: 1, holdOrderMeanSeconds: 30.5, holdOrderP90Seconds: 50,
        holdPaidMeanSeconds: 80, holdPaidP90Seconds: 100,
        dataAvailableFrom: new Date(from),
      }]),
    };
    service = new ReportsService(db);
  });

  it('returns cohort counts and distinct hold-to-order/paid durations', async () => {
    const report = await service.holdConversion(showtimeId, owner, from, to);
    expect(report).toMatchObject({
      cohort: 'A', startedSessions: 10, orderCreatedSessions: 5,
      paidSessions: 3, expiredSessions: 2, pendingAtCutoff: 1,
      holdToOrder: { meanSeconds: 30.5, p90Seconds: 50 },
      holdToPaid: { meanSeconds: 80, p90Seconds: 100 },
      dataAvailableFrom: from,
    });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('enforces owner scope before querying cohort data', async () => {
    await expect(service.holdConversion(showtimeId, { id: 'other', roles: ['ORGANIZER'] } as any, from, to))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects invalid, reversed, and overlong windows', async () => {
    await expect(service.holdConversion(showtimeId, owner, 'bad', to)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.holdConversion(showtimeId, owner, to, from)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.holdConversion(showtimeId, owner, from, '2027-10-03T00:00:00.000Z')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
