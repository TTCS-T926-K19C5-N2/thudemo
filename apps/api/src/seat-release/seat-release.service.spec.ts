import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SeatReleaseService } from './seat-release.service.js';

// tx mock: queue of $queryRaw / $executeRaw results, in call order.
function build(queryResults: unknown[][], executeResult = 1) {
  const queue = [...queryResults];
  const tx = {
    $queryRaw: vi.fn(async () => queue.shift() ?? []),
    $executeRaw: vi.fn(async () => executeResult),
  };
  const db = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    $queryRaw: vi.fn(async () => queue.shift() ?? []),
  };
  return { service: new SeatReleaseService(db as never), tx, db };
}

describe('SeatReleaseService.releaseCancelledTicketSeat (S-46)', () => {
  it('frees a seat whose only ticket was cancelled', async () => {
    const { service, tx } = build([
      [{ seatId: 'seat-1', status: 'CANCELLED' }],
      [{ exists: false }],
    ]);
    await expect(service.releaseCancelledTicketSeat('t1')).resolves.toEqual({
      released: true,
      seatId: 'seat-1',
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not free a seat that still has a valid ticket', async () => {
    const { service, tx } = build([
      [{ seatId: 'seat-1', status: 'CANCELLED' }],
      [{ exists: true }],
    ]);
    await expect(service.releaseCancelledTicketSeat('t1')).resolves.toEqual({
      released: false,
      seatId: 'seat-1',
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('does nothing for a ticket that is not cancelled', async () => {
    const { service, tx } = build([[{ seatId: 'seat-1', status: 'VALID' }]]);
    await expect(service.releaseCancelledTicketSeat('t1')).resolves.toEqual({
      released: false,
      seatId: 'seat-1',
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('is idempotent when the seat is already free', async () => {
    const { service } = build(
      [[{ seatId: 'seat-1', status: 'CANCELLED' }], [{ exists: false }]],
      0,
    );
    await expect(service.releaseCancelledTicketSeat('t1')).resolves.toEqual({
      released: false,
      seatId: 'seat-1',
    });
  });

  it('throws NotFound for an unknown ticket', async () => {
    const { service } = build([[]]);
    await expect(service.releaseCancelledTicketSeat('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports AVAILABLE for a seat that is not sold and not held', async () => {
    const { service } = build([[{ status: 'AVAILABLE' }]]);
    await expect(service.statusOfSeat('show', 'seat')).resolves.toBe('AVAILABLE');
  });
});
