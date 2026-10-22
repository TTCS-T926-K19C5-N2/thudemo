import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/guards/session-auth.guard.js';

export type StatementRow = { transactionId: string; amount: number };
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
  async financial(showtimeId: string, actor: AuthenticatedUser) {
    await this.owner(showtimeId, actor);
    const totals = await this.db.$queryRaw<
      {
        category: string;
        sold: number;
        held: number;
        available: number;
        gross: number;
        refunded: number;
      }[]
    >`SELECT c.name AS category,
      count(*) FILTER(WHERE s."isSold")::integer AS sold,
      count(*) FILTER(WHERE NOT s."isSold" AND EXISTS(SELECT 1 FROM seat_holds h WHERE h."seatId"=s.id AND h."expiresAt">clock_timestamp()))::integer AS held,
      count(*) FILTER(WHERE NOT s."isSold" AND NOT EXISTS(SELECT 1 FROM seat_holds h WHERE h."seatId"=s.id AND h."expiresAt">clock_timestamp()))::integer AS available,
      COALESCE((SELECT sum(oi."unitPrice") FROM order_items oi JOIN orders o ON o.id=oi."orderId" JOIN seats z ON z.id=oi."seatId" WHERE o."showtimeId"=${showtimeId}::uuid AND z."categoryId"=c.id AND EXISTS(SELECT 1 FROM payments p WHERE p."orderId"=o.id AND p.status='SUCCEEDED')),0)::integer AS gross,
      COALESCE((SELECT sum(oi."unitPrice") FROM order_items oi JOIN orders o ON o.id=oi."orderId" JOIN seats z ON z.id=oi."seatId" JOIN refunds r ON r."orderId"=o.id AND r.status='SUCCEEDED' WHERE o."showtimeId"=${showtimeId}::uuid AND z."categoryId"=c.id),0)::integer AS refunded
      FROM seat_categories c LEFT JOIN seats s ON s."categoryId"=c.id WHERE c."showtimeId"=${showtimeId}::uuid GROUP BY c.id,c.name ORDER BY c.name`;
    return {
      showtimeId,
      currency: 'VND',
      categories: totals.map((t) => ({ ...t, net: t.gross - t.refunded })),
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
