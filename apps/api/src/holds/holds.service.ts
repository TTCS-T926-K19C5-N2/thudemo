import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  HoldConnection,
  HoldQueryable,
} from '../prisma/hold-transaction.js';
import { SeatEventsService } from '../showtimes/seat-events.service.js';

export type ExpiredClaim = {
  seatId: string;
  token: string;
  showtimeId?: string;
};
export type HoldState = {
  serverTime: Date;
  hold: { id: string; expiresAt: Date; seatIds: string[] } | null;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestedSeats(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Chọn danh sách ghế hợp lệ.');
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => key !== 'seatIds') ||
    !Array.isArray(value.seatIds) ||
    value.seatIds.length < 1 ||
    value.seatIds.length > 2000 ||
    value.seatIds.some((id) => typeof id !== 'string' || !uuid.test(id))
  ) {
    throw new BadRequestException(
      'Danh sách cần từ 1 đến 2000 mã ghế hợp lệ; không gửi chủ giữ, giá hoặc thời hạn.',
    );
  }
  const ids = (value.seatIds as string[]).map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException('Danh sách ghế không được trùng.');
  // Global lock order prevents overlapping multi-seat claims from deadlocking.
  return [...ids].sort();
}

// S-42 limit cache TTL per API instance (organizer changes apply within it).
export const S42_LIMIT_CACHE_TTL_MS = 10_000;

// S-42: organizer-set per-account limit. null/undefined = unlimited.
export function parseTicketLimit(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Gửi giới hạn dạng { maxTicketsPerUser }.');
  const value = (body as Record<string, unknown>).maxTicketsPerUser;
  if (value === null || value === undefined) return null;
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 2000
  )
    throw new BadRequestException(
      'Giới hạn từ 1 đến 2000 vé, hoặc để trống (không giới hạn).',
    );
  return value as number;
}

@Injectable()
export class HoldsService {
  private readonly logger = new Logger(HoldsService.name);
  // S-42 limit cache: T-31/S-43 prove every extra pooled query on the claim
  // hot path breaks the concurrency/NFR gates, so unlimited showtimes cost
  // zero PG after the first lookup. Staleness window per API instance; the
  // organizer-facing half (ticket-limit endpoint) stays strongly consistent.
  private readonly limitCache = new Map<
    string,
    { limit: number | null; at: number }
  >();
  // Singleflight: a cold container hit by a 200-way burst must issue one
  // limit lookup, not 200 — otherwise the lookups flood the 10-connection
  // hold pool and time out real claims (T-31/S-43 concurrency gates).
  private readonly limitInflight = new Map<string, Promise<number | null>>();
  private limitCacheTtlMs = S42_LIMIT_CACHE_TTL_MS;
  constructor(
    private readonly db: PrismaService,
    @Optional() private readonly seatEvents?: SeatEventsService,
  ) {}

  private async loadLimit(
    showtimeId: string,
    client?: HoldConnection,
  ): Promise<number | null> {
    try {
      const [row] = await this.db.seatReadQuery<
        { maxTicketsPerUser: number | null; isDemo?: boolean | null }[]
      >(
        Prisma.sql`SELECT "maxTicketsPerUser", "isDemo" FROM showtimes WHERE id=${showtimeId}::uuid`,
        client,
      );
      if (row?.isDemo) {
        throw new ConflictException({
          code: 'DEMO_NOT_BOOKABLE',
          message:
            'Đây là suất diễn mô phỏng; sơ đồ ghế chỉ dùng để tham khảo.',
        });
      }
      // Owner chốt S-42: mặc định 4 vé/tài khoản/suất (migration backfill 4);
      // NULL = BTC mở không giới hạn. Suất lạ (không có hàng) cũng dùng 4 —
      // routine giữ ghế sẽ trả 404 sau. `?? null` giữ tương thích test cũ mock
      // hàng thiếu cột.
      if (!row) return 4;
      return row.maxTicketsPerUser ?? null;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // A configured limit must never be bypassed because the read pool is
      // unavailable. Do not cache the failure: a later claim can retry.
      this.logger.warn(JSON.stringify({ event: 'ticket_limit_unavailable' }));
      throw new ServiceUnavailableException(
        'Không thể kiểm tra giới hạn vé. Vui lòng thử lại.',
      );
    }
  }

  private async ticketLimitFor(
    showtimeId: string,
    client?: HoldConnection,
  ): Promise<number | null> {
    const now = Date.now();
    const cached = this.limitCache.get(showtimeId);
    if (cached && now - cached.at < this.limitCacheTtlMs) return cached.limit;
    let inflight = this.limitInflight.get(showtimeId);
    if (!inflight) {
      inflight = this.loadLimit(showtimeId, client)
        .then((limit) => {
          this.limitCache.set(showtimeId, { limit, at: Date.now() });
          this.limitInflight.delete(showtimeId);
          return limit;
        })
        .finally(() => this.limitInflight.delete(showtimeId));
      this.limitInflight.set(showtimeId, inflight);
    }
    return inflight;
  }

  async claim(
    showtimeId: string,
    userId: string,
    sessionHash: string,
    body: unknown,
    client?: HoldConnection,
  ): Promise<HoldState> {
    const seatIds = requestedSeats(body);
    // Authoritative quota is checked under the account lock by claim_hold_v5.
    // Keep the cached lookup only as an early demo-mode rejection.
    await this.ticketLimitFor(showtimeId, client);
    const requestId = randomUUID();
    try {
      // v4 rejects known conflicts without writes; v3 rolls racing rejections
      // back inside its subtransaction. Expected
      // conflicts are outcomes, not PostgreSQL error/log storms. Await BEGIN
      // and timeout setup before pipelining this validated routine.
      const [result] = await this.db.commitHoldRoutine<
        {
          serverTime: Date;
          id: string;
          expiresAt: Date;
          seatIds: string[];
          failure: string | null;
          rejectedSeatIds: string[];
        }[]
      >(
        Prisma.sql`
        SELECT * FROM public.claim_hold_v5(
          ${showtimeId}::uuid, ${userId}::uuid, ${sessionHash}::text,
          ${'{' + seatIds.join(',') + '}'}::uuid[], ${randomUUID()}::uuid, ${randomUUID()}::uuid
        )`,
        client,
      );
      if (result.failure) {
        if (result.failure === 'H0007')
          throw new ForbiddenException({
            code: 'TICKET_LIMIT',
            message: 'Tổng ghế đang giữ và đã mua vượt giới hạn của suất diễn.',
          });
        if (result.failure === 'H0008')
          throw new ConflictException({
            code: 'DEMO_NOT_BOOKABLE',
            message: 'Suất mô phỏng không cho đặt vé.',
          });
        if (result.failure === 'H0001')
          throw new NotFoundException('Không tìm thấy suất diễn.');
        if (result.failure === 'H0002')
          throw new ConflictException({
            code: 'SHOWTIME_CLOSED',
            message: 'Suất diễn đã đóng bán. Chọn suất khác.',
            rejectedSeatIds: seatIds,
          });
        if (result.failure === 'H0003')
          throw new BadRequestException(
            'Ghế không thuộc suất diễn hoặc chưa có giá. Tải lại sơ đồ.',
          );
        if (result.failure === 'H0004') {
          const rejected = result.rejectedSeatIds;
          if (
            Array.isArray(rejected) &&
            rejected.length > 0 &&
            rejected.every(
              (id) => typeof id === 'string' && seatIds.includes(id),
            )
          ) {
            throw new ConflictException({
              code: 'SEAT_CONFLICT',
              message: 'Một số ghế vừa được người khác giữ. Chọn ghế khác.',
              rejectedSeatIds: rejected,
              requestId,
            });
          }
        }
        if (result.failure === 'H0005')
          throw new ConflictException({
            code: 'HOLD_EXPIRED',
            message: 'Lượt giữ vừa hết hạn. Tải lại sơ đồ rồi chọn lại.',
            rejectedSeatIds: seatIds,
            requestId,
          });
        if (result.failure === 'H0006')
          throw new ServiceUnavailableException({
            code: 'HOLD_RETRY',
            message: 'Trạng thái ghế đang thay đổi. Tải lại sơ đồ rồi thử lại.',
            requestId,
          });
        throw new ServiceUnavailableException({
          code: 'HOLD_UNAVAILABLE',
          message:
            'Giữ ghế tạm thời không khả dụng. Tải lại sơ đồ rồi thử lại.',
          requestId,
        });
      }
      this.seatEvents?.invalidate(showtimeId);
      return {
        serverTime: result.serverTime,
        hold: {
          id: result.id,
          expiresAt: result.expiresAt,
          seatIds: result.seatIds,
        },
      };
    } catch (caught) {
      if (caught instanceof HttpException) throw caught;

      let error = caught;
      if (typeof caught === 'object' && caught !== null && 'code' in caught) {
        if (caught.code === 'H0001')
          error = new NotFoundException('Không tìm thấy suất diễn.');
        if (caught.code === 'H0002')
          error = new ConflictException({
            code: 'SHOWTIME_CLOSED',
            message: 'Suất diễn đã đóng bán. Chọn suất khác.',
            rejectedSeatIds: seatIds,
          });
        if (caught.code === 'H0003')
          error = new BadRequestException(
            'Ghế không thuộc suất diễn hoặc chưa có giá. Tải lại sơ đồ.',
          );
        if (
          caught.code === 'H0004' &&
          'detail' in caught &&
          typeof caught.detail === 'string'
        ) {
          let rejected: unknown;
          try {
            rejected = JSON.parse(caught.detail);
          } catch {
            /* fail closed below */
          }
          if (
            Array.isArray(rejected) &&
            rejected.length > 0 &&
            rejected.every(
              (id) => typeof id === 'string' && seatIds.includes(id),
            )
          ) {
            error = new ConflictException({
              code: 'SEAT_CONFLICT',
              message: 'Một số ghế vừa được người khác giữ. Chọn ghế khác.',
              rejectedSeatIds: rejected,
              requestId,
            });
          }
        }
        if (caught.code === 'H0005')
          error = new ConflictException({
            code: 'HOLD_EXPIRED',
            message: 'Lượt giữ vừa hết hạn. Tải lại sơ đồ rồi chọn lại.',
            rejectedSeatIds: seatIds,
            requestId,
          });
      }
      if (
        typeof caught === 'object' &&
        caught !== null &&
        'code' in caught &&
        caught.code === 'H0006'
      )
        error = new ServiceUnavailableException({
          code: 'HOLD_RETRY',
          message: 'Trạng thái ghế đang thay đổi. Tải lại sơ đồ rồi thử lại.',
          requestId,
        });
      // Concurrent inserts can report the secondary unique index before the PK arbiter.
      // Transaction has rolled back; translate only the known ownership constraint.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'seat_holds_seatId_showtimeId_key'
      ) {
        const rejected = await this.db.seatReadQuery<{ seatId: string }[]>(
          Prisma.sql`SELECT h."seatId" FROM seat_holds h JOIN hold_sessions hs ON hs.id=h."holdSessionId"
            WHERE h."seatId" IN (${Prisma.join(seatIds.map((id) => Prisma.sql`${id}::uuid`))}) AND h."expiresAt">clock_timestamp()
            AND NOT (hs."userId"=${userId}::uuid AND hs."sessionHash"=${sessionHash})`,
        );
        this.logger.warn(
          JSON.stringify({
            event: 'hold_conflict',
            requestId,
            rejectedCount: rejected.length,
            code: 'SEAT_CONFLICT',
          }),
        );
        if (rejected.length)
          throw new ConflictException({
            code: 'SEAT_CONFLICT',
            message: 'Một số ghế vừa được người khác giữ. Chọn ghế khác.',
            rejectedSeatIds: rejected.map((s) => s.seatId),
            requestId,
          });
        throw new ServiceUnavailableException({
          code: 'HOLD_RETRY',
          message: 'Trạng thái ghế đang thay đổi. Tải lại sơ đồ rồi thử lại.',
          requestId,
        });
      }
      if (error instanceof ConflictException) {
        const resObj = error.getResponse() as {
          code?: string;
          rejectedSeatIds?: string[];
        };
        if (resObj?.code !== 'SEAT_CONFLICT') {
          this.logger.warn(
            JSON.stringify({
              event: 'hold_conflict',
              requestId,
              rejectedCount: resObj?.rejectedSeatIds?.length ?? 0,
              code: resObj?.code,
            }),
          );
        }
      }
      if (error instanceof HttpException) throw error;
      this.logger.error(
        JSON.stringify({
          event: 'hold_failed',
          requestId,
          code: 'HOLD_UNAVAILABLE',
        }),
      );
      throw new ServiceUnavailableException({
        code: 'HOLD_UNAVAILABLE',
        message: 'Giữ ghế tạm thời không khả dụng. Tải lại sơ đồ rồi thử lại.',
        requestId,
      });
    }
  }

  // S-42: owned = unexpired holds (all sessions of this account; PENDING orders
  // keep their seat_holds rows, so they are already included) + PAID and
  // NEEDS_REVIEW order seats. Sequential accumulation is blocked here; a
  // same-millisecond race needs a proc-level check (S-42b).

  async releaseSeat(
    showtimeId: string,
    userId: string,
    sessionHash: string,
    seatId: string,
    client?: HoldConnection,
  ): Promise<HoldState> {
    const result = await this.db.holdTransaction(async (tx) => {
      // Match create-order's lock so release and order creation serialize.
      const sessions = await tx.$queryRaw<
        { id: string; token: string }[]
      >(Prisma.sql`SELECT id, token FROM hold_sessions
        WHERE "showtimeId"=${showtimeId}::uuid AND "userId"=${userId}::uuid
          AND "sessionHash"=${sessionHash} FOR UPDATE`);
      const session = sessions[0];
      const target = await tx.$queryRaw<
        { holdSessionId: string; userId: string; sessionHash: string }[]
      >(Prisma.sql`SELECT h."holdSessionId", hs."userId", hs."sessionHash"
        FROM seat_holds h JOIN hold_sessions hs ON hs.id=h."holdSessionId"
        WHERE h."seatId"=${seatId}::uuid AND h."showtimeId"=${showtimeId}::uuid
          AND h."expiresAt">clock_timestamp()`);
      if (!target.length) throw new NotFoundException('Ghế không còn được giữ.');
      if (
        !session || target[0].holdSessionId !== session.id ||
        target[0].userId !== userId || target[0].sessionHash !== sessionHash
      ) throw new ForbiddenException('Bạn không sở hữu lượt giữ ghế này.');

      const activeOrders = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM orders WHERE "holdSessionId"=${session.id}::uuid
          AND status NOT IN ('CANCELLED','EXPIRED') LIMIT 1`);
      if (activeOrders.length)
        throw new ConflictException({ code: 'HOLD_ORDER_STARTED', message: 'Không thể đổi ghế sau khi đơn đã được tạo.' });

      const deleted = await tx.$queryRaw<{ seatId: string }[]>(Prisma.sql`
        DELETE FROM seat_holds h USING hold_sessions hs
        WHERE h."seatId"=${seatId}::uuid AND h."showtimeId"=${showtimeId}::uuid
          AND h."holdSessionId"=hs.id AND h.token=hs.token
          AND hs.id=${session.id}::uuid AND hs."userId"=${userId}::uuid
          AND hs."sessionHash"=${sessionHash} AND h."expiresAt">clock_timestamp()
          AND hs."expiresAt">clock_timestamp()
        RETURNING h."seatId"`);
      if (!deleted.length) throw new NotFoundException('Ghế không còn được giữ.');
      await tx.$queryRaw(Prisma.sql`UPDATE hold_sessions
        SET "expectedSeatIds"=array_remove("expectedSeatIds", ${seatId}::uuid)
        WHERE id=${session.id}::uuid AND token=${session.token}::uuid`);
      await tx.$queryRaw(Prisma.sql`INSERT INTO waitlist_availability_signals(id,"showtimeId","releasedCount")
        SELECT gen_random_uuid(),${showtimeId}::uuid,1
        WHERE EXISTS (SELECT 1 FROM waitlist_entries WHERE "showtimeId"=${showtimeId}::uuid AND status='ACTIVE')`);
      return this.state(tx, showtimeId, userId, sessionHash);
    }, client);
    this.seatEvents?.invalidate(showtimeId);
    return result;
  }

  current(showtimeId: string, userId: string, sessionHash: string) {
    return this.state(this.db, showtimeId, userId, sessionHash);
  }

  private async state(
    tx: HoldQueryable,
    showtimeId: string,
    userId: string,
    sessionHash: string,
  ): Promise<HoldState> {
    const [result] = await tx.$queryRaw<
      {
        serverTime: Date;
        id: string | null;
        expiresAt: Date | null;
        seatIds: string[];
      }[]
    >(Prisma.sql`
      SELECT clock_timestamp() AS "serverTime", hs.id, hs."expiresAt",
        COALESCE(array_agg(h."seatId" ORDER BY h."seatId") FILTER (WHERE h."seatId" IS NOT NULL),'{}'::uuid[]) AS "seatIds"
      FROM (SELECT 1) anchor LEFT JOIN hold_sessions hs ON hs."showtimeId"=${showtimeId}::uuid
        AND hs."userId"=${userId}::uuid AND hs."sessionHash"=${sessionHash} AND hs."expiresAt">clock_timestamp()
      LEFT JOIN seat_holds h ON h."holdSessionId"=hs.id AND h.token=hs.token AND h."expiresAt">clock_timestamp()
      GROUP BY hs.id,hs."expiresAt"`);
    return {
      serverTime: result.serverTime,
      hold:
        result.id && result.expiresAt && result.seatIds.length
          ? {
              id: result.id,
              expiresAt: result.expiresAt,
              seatIds: result.seatIds,
            }
          : null,
    };
  }

  expiredBatch(): Promise<ExpiredClaim[]> {
    return this.db.$queryRaw(
      Prisma.sql`SELECT h."seatId", h.token, h."showtimeId" FROM seat_holds h
        WHERE h."expiresAt" <= clock_timestamp()
        AND NOT EXISTS (
          SELECT 1 FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          WHERE oi."seatId" = h."seatId"
          AND o.status = 'NEEDS_REVIEW'
        )
        ORDER BY h."expiresAt", h."seatId" LIMIT 1000`,
    );
  }

  async cleanupBatch(candidates: ExpiredClaim[]): Promise<number> {
    if (!candidates.length) return 0;
    // Snapshot token AND current expiry are checked again: an old job cannot delete a new right.
    const [cleanup] = await this.db.$queryRaw<{ deleted: number }[]>(Prisma.sql`
      WITH deleted AS (
        DELETE FROM seat_holds h USING jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb) AS old("seatId" uuid,token uuid)
        WHERE h."seatId"=old."seatId" AND h.token=old.token AND h."expiresAt"<=clock_timestamp()
        RETURNING h."showtimeId"
      ), grouped AS (
        SELECT "showtimeId",count(*)::int AS released_count FROM deleted GROUP BY "showtimeId"
      ), signals AS (
        INSERT INTO waitlist_availability_signals(id,"showtimeId","releasedCount")
        SELECT gen_random_uuid(),g."showtimeId",g.released_count
        FROM grouped g WHERE EXISTS (
          SELECT 1 FROM waitlist_entries e WHERE e."showtimeId"=g."showtimeId" AND e.status='ACTIVE'
        ) RETURNING id
      ) SELECT (SELECT count(*)::int FROM deleted) AS deleted`);
    const deleted = cleanup?.deleted ?? 0;
    if (deleted > 0 && this.seatEvents) {
      for (const showtimeId of new Set(
        candidates
          .map((candidate) => candidate.showtimeId)
          .filter((id): id is string => typeof id === 'string'),
      )) {
        this.seatEvents.invalidate(showtimeId);
      }
    }
    return deleted;
  }

  async sweep(): Promise<number> {
    let deleted = 0;
    for (let batch = 0; batch < 10; batch++) {
      const candidates = await this.expiredBatch();
      deleted += await this.cleanupBatch(candidates);
      if (candidates.length < 1000) break;
    }
    this.logger.log(JSON.stringify({ event: 'hold_expiry', deleted }));
    return deleted;
  }
}
