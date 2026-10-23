import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/guards/session-auth.guard.js';

export type StatementRow = { transactionId: string; amount: number };
export type CouponAllocationItem = {
  code: string;
  unitPrice: number;
};

/**
 * Allocate an order-level integer-VND coupon discount across tickets. Each
 * ticket first receives its proportional floor; remaining VND are assigned in
 * ascending ticket-code order, as approved in D12.
 */
export function allocateCouponDiscount(
  items: CouponAllocationItem[],
  discountAmount: number,
): Map<string, number> {
  if (!Number.isSafeInteger(discountAmount) || discountAmount < 0)
    throw new BadRequestException('Khoản giảm giá không hợp lệ.');
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice, 0);
  if (
    items.some(
      (item) =>
        !Number.isSafeInteger(item.unitPrice) || item.unitPrice < 0 || !item.code,
    ) ||
    discountAmount > subtotal ||
    new Set(items.map((item) => item.code)).size !== items.length
  )
    throw new BadRequestException('Dữ liệu phân bổ giảm giá không hợp lệ.');
  if (subtotal === 0 && discountAmount !== 0)
    throw new BadRequestException('Không thể giảm giá trên đơn 0 đồng.');

  const total = BigInt(subtotal);
  const discount = BigInt(discountAmount);
  const allocations = new Map(
    items.map((item) => [
      item.code,
      subtotal === 0
        ? 0
        : Number((discount * BigInt(item.unitPrice)) / total),
    ]),
  );
  let remainder = discountAmount - [...allocations.values()].reduce((sum, amount) => sum + amount, 0);
  for (const item of [...items].sort((left, right) =>
    left.code < right.code ? -1 : left.code > right.code ? 1 : 0,
  )) {
    if (remainder === 0) break;
    if (allocations.get(item.code)! < item.unitPrice) {
      allocations.set(item.code, allocations.get(item.code)! + 1);
      remainder -= 1;
    }
  }
  if (remainder !== 0)
    throw new BadRequestException('Không thể phân bổ hết khoản giảm giá.');
  return allocations;
}

export function attendanceCsvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function attendanceCsv(rows: {
  ticketCode: string;
  seat: string;
  entryTime: Date;
  gate: string;
  conflict: boolean;
}[]): string {
  const header = 'ticket_code,seat,entry_time_utc,gate,conflict';
  return (
    '\uFEFF' +
    [header, ...rows.map((r) => [
      r.ticketCode,
      r.seat,
      r.entryTime.toISOString(),
      r.gate,
      r.conflict ? 'true' : 'false',
    ].map(attendanceCsvCell).join(','))].join('\r\n') +
    '\r\n'
  );
}
export function parseDemoStatement(input: unknown): StatementRow[] {
  if (typeof input !== 'string' || input.length > 1000000)
    throw new BadRequestException('CSV không hợp lệ hoặc lớn hơn 1MB.');
  const lines = input
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);
  if (lines.shift() !== 'transactionId,amount')
    throw new BadRequestException(
      'CSV demo cần header transactionId,amount; VND nguyên, không chứa dấu phân cách hàng nghìn.',
    );
  if (lines.length < 1 || lines.length > 10000)
    throw new BadRequestException('CSV cần 1–10000 dòng.');
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const fields = line.split(',');
    if (
      fields.length !== 2 ||
      !/^[A-Za-z0-9_.:-]{1,100}$/.test(fields[0]) ||
      !/^\d{1,10}$/.test(fields[1]) ||
      Number(fields[1]) > 2147483647 ||
      seen.has(fields[0])
    )
      throw new BadRequestException(
        `Dòng ${index + 2} sai định dạng hoặc trùng mã giao dịch.`,
      );
    seen.add(fields[0]);
    return { transactionId: fields[0], amount: Number(fields[1]) };
  });
}
export function reconcileRows(
  provider: StatementRow[],
  system: StatementRow[],
) {
  const bank = new Map(provider.map((row) => [row.transactionId, row.amount]));
  const app = new Map(system.map((row) => [row.transactionId, row.amount]));
  return [...new Set([...bank.keys(), ...app.keys()])]
    .sort()
    .map((transactionId) => {
      const providerAmount = bank.get(transactionId) ?? null,
        systemAmount = app.get(transactionId) ?? null;
      return {
        transactionId,
        providerAmount,
        systemAmount,
        classification:
          providerAmount === null
            ? 'SYSTEM_ONLY'
            : systemAmount === null
              ? 'PROVIDER_ONLY'
              : providerAmount === systemAmount
                ? 'MATCHED'
                : 'AMOUNT_MISMATCH',
      };
    });
}
@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}
  async owner(showtimeId: string, actor: AuthenticatedUser) {
    const show = await this.db.showtime.findUnique({
      where: { id: showtimeId },
      include: { event: true },
    });
    if (!show) throw new NotFoundException('Không tìm thấy suất.');
    if (!actor.roles.includes('ADMIN') && show.event.organizerId !== actor.id)
      throw new ForbiddenException('Không có quyền xem suất diễn.');
    return show;
  }
  async attendance(showtimeId: string, actor: AuthenticatedUser) {
    await this.owner(showtimeId, actor);
    const [counts] = await this.db.$queryRaw<
      { valid: number; entered: number }[]
    >`SELECT
      count(*) FILTER(WHERE t.status<>'CANCELLED')::integer AS valid,
      count(*) FILTER(WHERE t.status<>'CANCELLED' AND EXISTS(SELECT 1 FROM ticket_admissions a WHERE a."ticketId"=oi.id AND a.kind='NORMAL'))::integer AS entered
      FROM tickets t JOIN order_items oi ON oi."orderId"=t."orderId" AND oi."seatId"=t."seatId" WHERE t."showtimeId"=${showtimeId}::uuid`;
    const byMinuteAndGate = await this.db.$queryRaw<
      { minute: Date; gateId: string; gateName: string; entered: number }[]
    >`SELECT date_trunc('minute',a."enteredAt") AS minute,a."gateId",max(a."gateName") AS "gateName",count(*)::integer AS entered
      FROM ticket_admissions a JOIN order_items oi ON oi.id=a."ticketId" JOIN tickets t ON t."orderId"=oi."orderId" AND t."seatId"=oi."seatId"
      WHERE a."showtimeId"=${showtimeId}::uuid AND a.kind='NORMAL' AND t.status<>'CANCELLED'
      GROUP BY 1,a."gateId" ORDER BY 1,a."gateId"`;
    return {
      showtimeId,
      validTickets: counts.valid,
      entered: counts.entered,
      notEntered: counts.valid - counts.entered,
      byMinuteAndGate,
      timezone: 'Asia/Ho_Chi_Minh',
      generatedAt: new Date().toISOString(),
    };
  }
  async attendanceConflictsCsv(showtimeId: string, actor: AuthenticatedUser) {
    await this.owner(showtimeId, actor);
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{
        ticketCode: string;
        seat: string;
        entryTime: Date;
        gate: string;
        conflict: boolean;
      }[]>(Prisma.sql`
        WITH normal AS (
          SELECT t.code AS "ticketCode", t."seatLabel" AS seat,
            a."enteredAt" AS "entryTime", a."gateName" AS gate,
            EXISTS (
              SELECT 1 FROM offline_scan_logs l
              WHERE l."showtimeId" = ${showtimeId}::uuid
                AND l."ticketCode" = t.code AND l.status = 'CONFLICT'
            ) AS conflict
          FROM ticket_admissions a
          JOIN order_items oi ON oi.id = a."ticketId"
          JOIN tickets t ON t."orderId" = oi."orderId" AND t."seatId" = oi."seatId"
          WHERE a."showtimeId" = ${showtimeId}::uuid AND a.kind = 'NORMAL'
            AND t.status <> 'CANCELLED'
        ), conflict_only AS (
          SELECT DISTINCT ON (l."ticketCode") l."ticketCode" AS "ticketCode",
            COALESCE(t."seatLabel", '') AS seat, l."scannedAt" AS "entryTime",
            COALESCE(g.name, '') AS gate, true AS conflict
          FROM offline_scan_logs l
          LEFT JOIN tickets t ON t.code = l."ticketCode" AND t."showtimeId" = l."showtimeId"
          LEFT JOIN check_in_gates g ON g.id = l."gateId"
          WHERE l."showtimeId" = ${showtimeId}::uuid AND l.status = 'CONFLICT'
            AND NOT EXISTS (SELECT 1 FROM normal n WHERE n."ticketCode" = l."ticketCode")
          ORDER BY l."ticketCode", l."scannedAt", l."scanId"
        )
        SELECT * FROM normal
        UNION ALL
        SELECT * FROM conflict_only
        ORDER BY "ticketCode"
      `);
      return attendanceCsv(rows);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async financial(showtimeId: string, actor: AuthenticatedUser) {
    await this.owner(showtimeId, actor);
    const totals = await this.db.$queryRaw<
      {
        category: string;
        sold: number;
        held: number;
        available: number;
      }[]
    >`SELECT c.name AS category,
      count(*) FILTER(WHERE s."isSold")::integer AS sold,
      count(*) FILTER(WHERE NOT s."isSold" AND EXISTS(SELECT 1 FROM seat_holds h WHERE h."seatId"=s.id AND h."expiresAt">clock_timestamp()))::integer AS held,
      count(*) FILTER(WHERE NOT s."isSold" AND NOT EXISTS(SELECT 1 FROM seat_holds h WHERE h."seatId"=s.id AND h."expiresAt">clock_timestamp()))::integer AS available
      FROM seat_categories c LEFT JOIN seats s ON s."categoryId"=c.id WHERE c."showtimeId"=${showtimeId}::uuid GROUP BY c.id,c.name ORDER BY c.name`;

    const financialItems = await this.db.$queryRaw<
      {
        orderId: string;
        category: string;
        code: string;
        unitPrice: number;
        discountAmount: number;
        refunded: boolean;
      }[]
    >`SELECT o.id AS "orderId", c.name AS category, t.code,
      oi."unitPrice", o."discountAmount",
      EXISTS(SELECT 1 FROM refunds r WHERE r."orderId"=o.id AND r.status='SUCCEEDED') AS refunded
      FROM order_items oi
      JOIN orders o ON o.id=oi."orderId"
      JOIN seats s ON s.id=oi."seatId"
      JOIN seat_categories c ON c.id=s."categoryId"
      JOIN tickets t ON t."orderId"=o.id AND t."seatId"=oi."seatId"
      WHERE o."showtimeId"=${showtimeId}::uuid
        AND EXISTS(SELECT 1 FROM payments p WHERE p."orderId"=o.id AND p.status='SUCCEEDED')
      ORDER BY o.id,t.code`;
    const financialByCategory = new Map<string, { gross: number; discount: number; refunded: number }>();
    const byOrder = new Map<string, typeof financialItems>();
    for (const item of financialItems) {
      const orderItems = byOrder.get(item.orderId) ?? [];
      orderItems.push(item);
      byOrder.set(item.orderId, orderItems);
    }
    for (const orderItems of byOrder.values()) {
      const allocations = allocateCouponDiscount(
        orderItems.map(({ code, unitPrice }) => ({ code, unitPrice })),
        orderItems[0]!.discountAmount,
      );
      for (const item of orderItems) {
        const totals = financialByCategory.get(item.category) ?? { gross: 0, discount: 0, refunded: 0 };
        const discount = allocations.get(item.code)!;
        totals.gross += item.unitPrice;
        totals.discount += discount;
        if (item.refunded) totals.refunded += item.unitPrice - discount;
        financialByCategory.set(item.category, totals);
      }
    }
    return {
      showtimeId,
      currency: 'VND',
      categories: totals.map((t) => {
        const financial = financialByCategory.get(t.category) ?? { gross: 0, discount: 0, refunded: 0 };
        return { ...t, ...financial, net: financial.gross - financial.discount - financial.refunded };
      }),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Session-level conversion report. HoldSession.createdAt is the durable
   * cohort start; domain_audit records order PAID transitions independently
   * of seat_holds cleanup. Sessions and orders are aggregated before joining,
   * so a multi-seat hold is counted once.
   */
  async holdConversion(
    showtimeId: string,
    actor: AuthenticatedUser,
    fromValue: unknown,
    toValue: unknown,
  ) {
    await this.owner(showtimeId, actor);
    const from = typeof fromValue === 'string' ? new Date(fromValue) : new Date(NaN);
    const to = typeof toValue === 'string' ? new Date(toValue) : new Date(NaN);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 366 * 86400000
    )
      throw new BadRequestException('Khoảng thời gian phải hợp lệ và tối đa 366 ngày.');

    const [row] = await this.db.$queryRaw<{
      started: number;
      orderCreated: number;
      paid: number;
      expired: number;
      cancelled: number;
      pendingAtCutoff: number;
      holdOrderMeanSeconds: number | null;
      holdOrderP90Seconds: number | null;
      holdPaidMeanSeconds: number | null;
      holdPaidP90Seconds: number | null;
      dataAvailableFrom: Date | null;
    }[]>`
      WITH cohort AS (
        SELECT hs.id, hs."createdAt", hs."expiresAt"
        FROM hold_sessions hs
        WHERE hs."showtimeId"=${showtimeId}::uuid
          AND hs."createdAt">=${from} AND hs."createdAt"<${to}
      ), session_outcomes AS (
        SELECT c.id, c."createdAt" AS started_at, c."expiresAt" AS expires_at,
          o.id AS order_id, o.status AS order_status, o."createdAt" AS order_at,
          paid.paid_at
        FROM cohort c
        LEFT JOIN LATERAL (
          SELECT x.id,x.status,x."createdAt"
          FROM orders x WHERE x."holdSessionId"=c.id
          ORDER BY x."createdAt",x.id LIMIT 1
        ) o ON true
        LEFT JOIN LATERAL (
          SELECT min(a."createdAt") AS paid_at
          FROM domain_audit a
          WHERE a."entityType"='orders' AND a."entityId"=o.id
            AND a."afterState"->>'status'='PAID'
            AND a."createdAt"<=${to}
        ) paid ON true
      ), all_sessions AS (
        SELECT min("createdAt") AS first_fact FROM hold_sessions WHERE "showtimeId"=${showtimeId}::uuid
      )
      SELECT
        count(*)::integer AS started,
        count(*) FILTER(WHERE order_at<=${to})::integer AS "orderCreated",
        count(*) FILTER(WHERE paid_at IS NOT NULL)::integer AS paid,
        count(*) FILTER(WHERE order_id IS NOT NULL AND order_status='EXPIRED'
          OR order_id IS NULL AND expires_at<=${to})::integer AS expired,
        count(*) FILTER(WHERE order_id IS NOT NULL AND order_status='CANCELLED')::integer AS cancelled,
        count(*) FILTER(WHERE order_id IS NULL AND expires_at>${to})::integer AS "pendingAtCutoff",
        avg(extract(epoch FROM (order_at-started_at))) FILTER(WHERE order_at<=${to})::float8 AS "holdOrderMeanSeconds",
        percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (order_at-started_at))) FILTER(WHERE order_at<=${to})::float8 AS "holdOrderP90Seconds",
        avg(extract(epoch FROM (paid_at-started_at))) FILTER(WHERE paid_at IS NOT NULL)::float8 AS "holdPaidMeanSeconds",
        percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (paid_at-started_at))) FILTER(WHERE paid_at IS NOT NULL)::float8 AS "holdPaidP90Seconds",
        (SELECT first_fact FROM all_sessions) AS "dataAvailableFrom"
      FROM session_outcomes`;
    return {
      showtimeId,
      cohort: 'A',
      from: from.toISOString(),
      to: to.toISOString(),
      cutoff: to.toISOString(),
      timezone: 'UTC',
      durationUnit: 'seconds',
      startedSessions: row.started,
      orderCreatedSessions: row.orderCreated,
      paidSessions: row.paid,
      expiredSessions: row.expired,
      cancelledSessions: row.cancelled,
      pendingAtCutoff: row.pendingAtCutoff,
      holdToOrder: { meanSeconds: row.holdOrderMeanSeconds, p90Seconds: row.holdOrderP90Seconds },
      holdToPaid: { meanSeconds: row.holdPaidMeanSeconds, p90Seconds: row.holdPaidP90Seconds },
      dataAvailableFrom: row.dataAvailableFrom?.toISOString() ?? null,
      generatedAt: new Date().toISOString(),
    };
  }
  async reconcile(input: unknown, actor: AuthenticatedUser) {
    if (!input || typeof input !== 'object')
      throw new BadRequestException('Gửi CSV và kỳ đối soát.');
    const body = input as Record<string, unknown>;
    const rows = parseDemoStatement(body.csv);
    const start = new Date(String(body.periodStart)),
      end = new Date(String(body.periodEnd));
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end ||
      end.getTime() - start.getTime() > 366 * 86400000
    )
      throw new BadRequestException(
        'Kỳ đối soát hợp lệ tối đa 366 ngày, cuối kỳ không bao gồm.',
      );
    const gateway = body.gateway;
    if (gateway !== 'mock')
      throw new BadRequestException(
        'Định dạng hiện tại chỉ đối soát mock; chưa nhận sao kê nhà cung cấp thật.',
      );
    const payments = await this.db.payment.findMany({
      where: {
        gateway,
        status: 'SUCCEEDED',
        updatedAt: { gte: start, lt: end },
      },
      select: { transactionId: true, gatewayRef: true, amount: true },
    });
    const result = reconcileRows(
      rows,
      payments.map((p) => ({
        transactionId: p.transactionId ?? p.gatewayRef,
        amount: p.amount,
      })),
    );
    const summary = {
      format: 'LOCAL_MOCK_STATEMENT_V1',
      gateway,
      rows: result,
      generatedAt: new Date().toISOString(),
    };
    if (body.dryRun !== false) return { dryRun: true, ...summary };
    const hash = createHash('sha256')
      .update(JSON.stringify({ rows, start, end, gateway }))
      .digest('hex');
    return this.db.reconciliationRun.upsert({
      where: { fileHash: hash },
      create: {
        fileHash: hash,
        actorId: actor.id,
        periodStart: start,
        periodEnd: end,
        result: summary,
      },
      update: {},
    });
  }
  async timeline(orderId: string, actor: AuthenticatedUser) {
    const order = await this.db.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Không tìm thấy đơn.');
    if (
      order.userId !== actor.id &&
      !actor.roles.some((r) => ['ADMIN', 'ACCOUNTANT'].includes(r))
    )
      throw new ForbiddenException('Không có quyền xem nhật ký.');
    // Hold events can precede order creation: link those through holdSessionId.
    return this.db.domainAudit.findMany({
      where: {
        OR: [
          { orderId },
          ...(order.holdSessionId ? [{ entityId: order.holdSessionId }] : []),
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
  }
}
