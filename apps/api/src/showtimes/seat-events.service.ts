import { Injectable, type MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD';

export interface SeatStatusChangedEvent {
  showtimeId: string;
  seatId: string;
  status: SeatStatus;
}

@Injectable()
export class SeatEventsService {
  private readonly subject = new Subject<SeatStatusChangedEvent>();

  emit(event: SeatStatusChangedEvent): void {
    this.subject.next(event);
  }

  emitBatch(events: SeatStatusChangedEvent[]): void {
    for (const event of events) {
      this.subject.next(event);
    }
  }

  onEvent(): Observable<SeatStatusChangedEvent> {
    return this.subject.asObservable();
  }

  stream(showtimeId: string): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      filter((event) => event.showtimeId === showtimeId),
      map(
        (event) =>
          ({
            data: event,
          }) as MessageEvent,
      ),
    );
  }
}
