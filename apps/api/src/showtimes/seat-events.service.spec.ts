import { firstValueFrom, take } from 'rxjs';
import { describe, expect, it } from 'vitest';
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
});
