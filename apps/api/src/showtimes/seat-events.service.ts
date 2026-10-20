import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export type SeatInventoryChange = {
  showtimeId: string;
  kind: 'refresh';
};

@Injectable()
export class SeatEventsService {
  private readonly changes = new Subject<SeatInventoryChange>();

  invalidate(showtimeId: string): void {
    this.changes.next({ showtimeId, kind: 'refresh' });
  }

  stream(showtimeId: string): Observable<MessageEvent> {
    return this.changes.asObservable().pipe(
      filter((change) => change.showtimeId === showtimeId),
      map((change) => ({ data: change })),
    );
  }
}
