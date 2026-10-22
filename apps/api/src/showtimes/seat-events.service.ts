import {
  Injectable,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map, finalize } from 'rxjs/operators';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type SeatInventoryChange = {
  showtimeId: string;
  kind: 'refresh' | 'snapshot';
  seats?: unknown[];
};

@Injectable()
export class SeatEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly changes = new Subject<SeatInventoryChange>();
  private snapshotLoader?: (id: string) => Promise<unknown[]>;
  private readonly revisions = new Map<string, number>();
  setSnapshotLoader(loader: (id: string) => Promise<unknown[]>) {
    this.snapshotLoader = loader;
  }
  private readonly watchers = new Map<string, number>();
  private readonly fingerprints = new Map<string, string>();
  private timer?: ReturnType<typeof setInterval>;
  private flight?: Promise<void>;
  constructor(@Optional() private readonly db?: PrismaService) {}
  onModuleInit() {
    if (!this.db) return;
    this.timer = setInterval(() => void this.poll(), 1000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flight;
  }
  private async poll() {
    if (this.flight || !this.db || !this.watchers.size) return;
    const ids = [...this.watchers.keys()];
    // Shared query per API process (not per viewer). Includes TTL expiry even
    // before the cleanup worker deletes the hold; also observes other replicas.
    this.flight = this.db
      .$queryRaw<{ showtimeId: string; fingerprint: string }[]>(
        Prisma.sql`
      SELECT s."showtimeId",md5(string_agg(s.id::text||s."isSold"::text||COALESCE(h."holdSessionId"::text,'')||COALESCE(c.price::text,''),',' ORDER BY s.id)) AS fingerprint
      FROM seats s JOIN seat_categories c ON c.id=s."categoryId"
      LEFT JOIN seat_holds h ON h."seatId"=s.id AND h."expiresAt">clock_timestamp()
      WHERE s."showtimeId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) GROUP BY s."showtimeId"`,
      )
      .then((rows) => {
        for (const row of rows) {
          const previous = this.fingerprints.get(row.showtimeId);
          this.fingerprints.set(row.showtimeId, row.fingerprint);
          if (previous !== undefined && previous !== row.fingerprint)
            this.invalidate(row.showtimeId);
        }
      })
      .catch(() => {
        /* Keep connections; next poll retries without inventing state. */
      })
      .finally(() => {
        this.flight = undefined;
      });
    return this.flight;
  }

  invalidate(showtimeId: string): void {
    if (!this.snapshotLoader || !this.watchers.has(showtimeId)) {
      this.changes.next({ showtimeId, kind: 'refresh' });
      return;
    }
    const revision = (this.revisions.get(showtimeId) ?? 0) + 1;
    this.revisions.set(showtimeId, revision);
    void Promise.resolve()
      .then(async () => {
        if (this.revisions.get(showtimeId) !== revision) return;
        const seats = await this.snapshotLoader!(showtimeId);
        if (this.revisions.get(showtimeId) === revision)
          this.changes.next({ showtimeId, kind: 'snapshot', seats });
      })
      .catch(() => {
        if (this.revisions.get(showtimeId) === revision)
          this.changes.next({ showtimeId, kind: 'refresh' });
      });
  }

  stream(showtimeId: string): Observable<MessageEvent> {
    this.watchers.set(showtimeId, (this.watchers.get(showtimeId) ?? 0) + 1);
    return this.changes.asObservable().pipe(
      filter((change) => change.showtimeId === showtimeId),
      map((change) => ({ data: change })),
      finalize(() => {
        const remaining = (this.watchers.get(showtimeId) ?? 1) - 1;
        if (remaining > 0) this.watchers.set(showtimeId, remaining);
        else {
          this.watchers.delete(showtimeId);
          this.fingerprints.delete(showtimeId);
          this.revisions.delete(showtimeId);
        }
      }),
    );
  }
}
