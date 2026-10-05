import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export type ExpiredClaim = { seatId: string; token: string };
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

@Injectable()
export class HoldsService {
  private readonly logger = new Logger(HoldsService.name);
  constructor(private readonly db: PrismaService) {}

  async claim(
    showtimeId: string,
    userId: string,
    sessionHash: string,
    body: unknown,
  ): Promise<HoldState> {
    const seatIds = requestedSeats(body);
    const requestId = randomUUID();
    try {
      return await this.db.$transaction(
        async (tx) => {
          // RETURNING dependencies preserve show -> session -> sorted seat locks
          // without three separate round trips. Invalid shows never write a session.
          // Keep state() in a separate statement: it needs a fresh snapshot/clock
          // after any session or seat lock wait, not this CTE's original snapshot.
          const [result] = await tx.$queryRaw<
            { status: string; valid: number; claimedSeatIds: string[] }[]
          >(Prisma.sql`
          WITH requested AS (SELECT ARRAY[${Prisma.join(seatIds.map((id) => Prisma.sql`${id}::uuid`))}] AS ids),
          available_show AS MATERIALIZED (
            SELECT id,status,
              (SELECT count(*)::int FROM seats s JOIN seat_categories c ON c.id=s."categoryId"
                WHERE s."showtimeId"=showtimes.id AND s.id IN (SELECT unnest(ids) FROM requested)
                  AND c.price IS NOT NULL) AS valid
            FROM showtimes WHERE id=${showtimeId}::uuid FOR SHARE
          ), authority AS (
            INSERT INTO hold_sessions (id,"showtimeId","userId","sessionHash",token,"expiresAt","expectedSeatIds")
            SELECT ${randomUUID()}::uuid,available_show.id,${userId}::uuid,${sessionHash},${randomUUID()}::uuid,
              clock_timestamp()+interval '10 minutes',requested.ids
            FROM available_show CROSS JOIN requested
            WHERE available_show.status='ON_SALE' AND available_show.valid=${seatIds.length}
            ON CONFLICT ("showtimeId","userId","sessionHash") DO UPDATE SET
              "expectedSeatIds"=CASE WHEN hold_sessions."expiresAt"<=EXCLUDED."expiresAt"-interval '10 minutes' THEN EXCLUDED."expectedSeatIds"
                ELSE ARRAY(SELECT DISTINCT seat_id FROM unnest(hold_sessions."expectedSeatIds" || EXCLUDED."expectedSeatIds") AS seat_id ORDER BY seat_id) END,
              token=CASE WHEN hold_sessions."expiresAt"<=EXCLUDED."expiresAt"-interval '10 minutes' THEN EXCLUDED.token ELSE hold_sessions.token END,
              "expiresAt"=CASE WHEN hold_sessions."expiresAt"<=EXCLUDED."expiresAt"-interval '10 minutes' THEN EXCLUDED."expiresAt" ELSE hold_sessions."expiresAt" END
            RETURNING id,token,"expiresAt","showtimeId"
          ), claimed AS (
            INSERT INTO seat_holds ("seatId","showtimeId","holdSessionId",token,"expiresAt")
            SELECT seat_id,authority."showtimeId",authority.id,authority.token,authority."expiresAt"
            FROM authority CROSS JOIN requested CROSS JOIN unnest(requested.ids) AS seat_id ORDER BY seat_id
            ON CONFLICT ("seatId") DO UPDATE SET "holdSessionId"=EXCLUDED."holdSessionId",token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt",
              "acquiredAt"=CASE WHEN seat_holds.token=EXCLUDED.token THEN seat_holds."acquiredAt" ELSE clock_timestamp() END
            WHERE seat_holds."expiresAt"<=clock_timestamp() OR (seat_holds."holdSessionId"=EXCLUDED."holdSessionId" AND seat_holds.token=EXCLUDED.token)
            RETURNING "seatId"
          )
          SELECT status,valid,COALESCE((SELECT array_agg("seatId" ORDER BY "seatId") FROM claimed),'{}'::uuid[]) AS "claimedSeatIds"
          FROM available_show`);
          if (!result) throw new NotFoundException('Không tìm thấy suất diễn.');
          if (result.status !== 'ON_SALE')
            throw new ConflictException({
              code: 'SHOWTIME_CLOSED',
              message: 'Suất diễn đã đóng bán. Chọn suất khác.',
              rejectedSeatIds: seatIds,
            });
          if (result.valid !== seatIds.length)
            throw new BadRequestException(
              'Ghế không thuộc suất diễn hoặc chưa có giá. Tải lại sơ đồ.',
            );
          if (result.claimedSeatIds.length !== seatIds.length) {
            const accepted = new Set(result.claimedSeatIds);
            throw new ConflictException({
              code: 'SEAT_CONFLICT',
              message: 'Một số ghế vừa được người khác giữ. Chọn ghế khác.',
              rejectedSeatIds: seatIds.filter((id) => !accepted.has(id)),
              requestId,
            });
          }
          const state = await this.state(tx, showtimeId, userId, sessionHash);
          if (!state.hold)
            throw new ConflictException({
              code: 'HOLD_EXPIRED',
              message: 'Lượt giữ vừa hết hạn. Tải lại sơ đồ rồi chọn lại.',
              rejectedSeatIds: seatIds,
              requestId,
            });
          return state;
        },
        { timeout: 10000, maxWait: 10000 },
      );
    } catch (error) {
      // Concurrent inserts can report the secondary unique index before the PK arbiter.
      // Transaction has rolled back; translate only the known ownership constraint.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2010'
      ) {
        const meta = error.meta as
          | {
              driverAdapterError?: {
                cause?: {
                  originalCode?: string;
                  constraint?: { index?: string };
                };
              };
            }
          | undefined;
        const cause = meta?.driverAdapterError?.cause;
        if (
          cause?.originalCode === '23505' &&
          cause.constraint?.index === 'seat_holds_seatId_showtimeId_key'
        ) {
          const rejected = await this.db.$queryRaw<
            { seatId: string }[]
          >(Prisma.sql`SELECT h."seatId" FROM seat_holds h JOIN hold_sessions hs ON hs.id=h."holdSessionId"
            WHERE h."seatId" IN (${Prisma.join(seatIds.map((id) => Prisma.sql`${id}::uuid`))}) AND h."expiresAt">clock_timestamp()
            AND NOT (hs."userId"=${userId}::uuid AND hs."sessionHash"=${sessionHash})`);
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
      }
      if (error instanceof ConflictException)
        this.logger.warn(
          JSON.stringify({
            event: 'hold_conflict',
            requestId,
            rejectedCount:
              (error.getResponse() as { rejectedSeatIds?: string[] })
                .rejectedSeatIds?.length ?? 0,
            code: (error.getResponse() as { code?: string }).code,
          }),
        );
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

  current(showtimeId: string, userId: string, sessionHash: string) {
    return this.state(this.db, showtimeId, userId, sessionHash);
  }

  private async state(
    tx: Prisma.TransactionClient,
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
      Prisma.sql`SELECT "seatId",token FROM seat_holds WHERE "expiresAt"<=clock_timestamp() ORDER BY "expiresAt","seatId" LIMIT 1000`,
    );
  }

  async cleanupBatch(candidates: ExpiredClaim[]): Promise<number> {
    if (!candidates.length) return 0;
    // Snapshot token AND current expiry are checked again: an old job cannot delete a new right.
    return this.db
      .$executeRaw(Prisma.sql`DELETE FROM seat_holds h USING jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb) AS old("seatId" uuid,token uuid)
      WHERE h."seatId"=old."seatId" AND h.token=old.token AND h."expiresAt"<=clock_timestamp()`);
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
