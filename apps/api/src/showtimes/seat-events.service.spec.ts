import { firstValueFrom, take } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SeatEventsService } from './seat-events.service.js';

describe('SeatEventsService', () => {
  it('only sends refresh notifications for the subscribed showtime', async () => {
    const service = new SeatEventsService();
    const update = firstValueFrom(service.stream('show-1').pipe(take(1)));

    service.invalidate('show-2');
    service.invalidate('show-1');

    await expect(update).resolves.toEqual({
      data: { showtimeId: 'show-1', kind: 'refresh' },
    });
  });
  it('pushes a shared authoritative public snapshot instead of causing a refetch storm', async () => {
    const service = new SeatEventsService();
    const seats = [{ id: 'seat', status: 'HELD' }];
    service.setSnapshotLoader(async () => seats);
    const event = firstValueFrom(service.stream('show-1').pipe(take(1)));
    service.invalidate('show-1');
    await expect(event).resolves.toEqual({
      data: { showtimeId: 'show-1', kind: 'snapshot', seats },
    });
  });
  it('never publishes an old slow snapshot after a newer committed revision', async () => {
    const service = new SeatEventsService();
    let release!: (value: unknown[]) => void;
    const loader = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<unknown[]>((r) => {
            release = r;
          }),
      )
      .mockResolvedValue([{ id: 'seat', status: 'SOLD' }]);
    service.setSnapshotLoader(loader);
    const event = firstValueFrom(service.stream('show-1').pipe(take(1)));
    service.invalidate('show-1');
    await new Promise((r) => setImmediate(r));
    service.invalidate('show-1');
    await expect(event).resolves.toMatchObject({
      data: { kind: 'snapshot', seats: [{ id: 'seat', status: 'SOLD' }] },
    });
    release([{ id: 'seat', status: 'AVAILABLE' }]);
  });
});
