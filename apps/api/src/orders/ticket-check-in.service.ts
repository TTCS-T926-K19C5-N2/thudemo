import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ScanCommand } from './admission-contract.js';
import { ADMISSION_OVERRIDE_POLICY as admissionOverridePolicy } from './admission-policy.js';
import { ScannerCryptoService } from '../scanner/scanner-crypto.service.js';
import {
  cancelledTicket,
  isValidUuid,
  notEligibleTicket,
  unknownTicket,
  wrongShowtime,
  type RejectionContext,
} from './ticket-rejection.js';

type Permission = { gateName: string; staffName: string; canOverride: boolean };
type Admission = {
  ticketId: string;
  showtimeId: string;
  gateId: string;
  gateName: string;
  kind: string;
  reason: string | null;
  enteredAt: Date;
};
type Ticket = {
  checkedInAt: Date | null;
  orderId: string;
  orderStatus: string;
  seatId: string;
  categoryName: string;
  row: string;
  seatNumber: number;
};

@Injectable()
export class TicketCheckInService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ScannerCryptoService,
  ) {}

  async gates(showtimeId: string, request: AuthenticatedRequest) {
    const gates = await this.db.$queryRaw<
      { gateId: string; gateName: string; canOverride: boolean }[]
    >(Prisma.sql`
      SELECT g.id AS "gateId", g.name AS "gateName", (p."canOverride" AND ${admissionOverridePolicy.approved}) AS "canOverride"
      FROM check_in_gates g JOIN check_in_permissions p ON p."gateId" = g.id
      WHERE g."showtimeId" = ${showtimeId}::uuid AND p."userId" = ${request.user.id}::uuid ORDER BY g.name`);
    return { gates };
  }

  async checkIn(
    showtimeId: string,
    command: ScanCommand,
    request: AuthenticatedRequest,
    exception = false,
  ) {
    // Resolve only after COMMIT. Lock the ticket AND paid order; failures roll back ledger and checkedInAt together.
    return this.db.$transaction(async (tx) => {
      const sessions = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT u.id FROM sessions s JOIN users u ON u.id = s."userId"
        WHERE s."tokenHash" = ${request.sessionHash ?? ''} AND u.id = ${request.user.id}::uuid
          AND s."expiresAt" > clock_timestamp() AND u."isEmailVerified" = true FOR SHARE OF s,u`);
      if (!sessions.length)
        throw new UnauthorizedException('Phiên đã hết hạn. Đăng nhập lại.');
      const [permission] = await tx.$queryRaw<Permission[]>(Prisma.sql`
        SELECT g.name AS "gateName", p."staffName", p."canOverride"
        FROM check_in_gates g JOIN check_in_permissions p ON p."gateId" = g.id
        WHERE g.id = ${command.gateId}::uuid AND g."showtimeId" = ${showtimeId}::uuid
          AND p."userId" = ${request.user.id}::uuid FOR SHARE OF p,g`);
      if (!permission)
        throw new ForbiddenException({
          code: 'SHOWTIME_ACCESS_DENIED',
          message: 'Bạn chưa được cấp quyền soát vé tại suất/cửa này.',
        });
      if (
        exception &&
        (!admissionOverridePolicy.approved || !permission.canOverride)
      ) {
        throw new ForbiddenException({
          code: 'OVERRIDE_DENIED',
          message:
            'Bạn chưa được cấp quyền cho vào có ghi chú tại suất/cửa này.',
        });
      }
      // NORMAL and EXCEPTION both resolve identity only from the same signed QR verifier.
      const ctx: RejectionContext = {
        showtimeId,
        gateId: command.gateId,
        staffId: request.user.id,
        requestId: command.requestId,
      };
      let claims: ReturnType<ScannerCryptoService['verifyQr']>;
      try {
        claims = this.crypto.verifyQr(command.qrPayload);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw unknownTicket(ctx);
        }
        throw error;
      }
      if (!isValidUuid(claims.showtimeId)) {
        throw unknownTicket(ctx);
      }
      if (claims.showtimeId.toLowerCase() !== showtimeId.toLowerCase()) {
        const [other] = await tx.$queryRaw<
          { eventName: string; startTime: Date }[]
        >(Prisma.sql`
          SELECT e.name AS "eventName", st."startTime"
          FROM showtimes st JOIN events e ON e.id = st."eventId"
          WHERE st.id = ${claims.showtimeId}::uuid`);
        if (!other) {
          throw unknownTicket(ctx);
        }
        throw wrongShowtime(ctx, other);
      }
      const ticketId = claims.ticketId;
      ctx.ticketId = ticketId;
      if (!isValidUuid(ticketId)) {
        throw unknownTicket(ctx, 'INVALID_TICKET');
      }
      const [ticket] = await tx.$queryRaw<Ticket[]>(Prisma.sql`
        SELECT oi."checkedInAt", oi."orderId", o.status::text AS "orderStatus",
          oi."seatId", oi."categoryName", s.row, s."seatNumber"
        FROM order_items oi JOIN orders o ON o.id = oi."orderId" JOIN seats s ON s.id = oi."seatId"
        WHERE oi.id = ${ticketId}::uuid AND o."showtimeId" = ${showtimeId}::uuid
          AND s."showtimeId" = ${showtimeId}::uuid FOR UPDATE OF oi,o`);
      if (!ticket) {
        throw unknownTicket(ctx, 'INVALID_TICKET');
      }
      const legacy = await tx.$queryRaw<
        { status: string; checkedInAt: Date | null; cancelledAt: Date | null }[]
      >(Prisma.sql`
        SELECT status, "checkedInAt", "cancelledAt" FROM tickets WHERE "orderId"=${ticket.orderId}::uuid AND "seatId"=${ticket.seatId}::uuid FOR UPDATE`);
      const cancelledLegacy = legacy.find((t) => t.status === 'CANCELLED');
      if (ticket.orderStatus === 'CANCELLED' || cancelledLegacy) {
        const cancelledAt = cancelledLegacy?.cancelledAt ?? null;
        throw cancelledTicket(ctx, cancelledAt);
      }
      if (ticket.orderStatus !== 'PAID') {
        throw notEligibleTicket(ctx);
      }
      ticket.checkedInAt ??=
        legacy.find((t) => t.status === 'CHECKED_IN')?.checkedInAt ?? null;
      const kind = exception ? 'EXCEPTION' : 'NORMAL';
      const [replay] = await tx.$queryRaw<Admission[]>(Prisma.sql`
        SELECT * FROM ticket_admissions WHERE "staffId" = ${request.user.id}::uuid AND "requestId" = ${command.requestId}::uuid`);
      if (replay) {
        if (
          replay.ticketId !== ticketId ||
          replay.showtimeId !== showtimeId ||
          replay.gateId !== command.gateId ||
          replay.kind !== kind ||
          replay.reason !== (command.reason ?? null)
        ) {
          throw new ConflictException({
            code: 'REQUEST_CONFLICT',
            message: 'Mã yêu cầu đã được sử dụng cho hành động khác.',
          });
        }
        return this.result('ALREADY_RECORDED', ticketId, ticket, replay);
      }
      const [first] = await tx.$queryRaw<Admission[]>(Prisma.sql`
        SELECT * FROM ticket_admissions WHERE "ticketId" = ${ticketId}::uuid AND kind = 'NORMAL'`);
      if (
        !exception &&
        (first ||
          ticket.checkedInAt ||
          legacy.some((t) => t.status === 'CHECKED_IN'))
      ) {
        throw new ConflictException({
          code: 'TICKET_ALREADY_CHECKED_IN',
          message: 'Vé đã sử dụng.',
          firstAdmission: {
            checkedInAt:
              (first?.enteredAt ?? ticket.checkedInAt)?.toISOString() ?? null,
            gateName:
              first?.gateName ?? 'Chưa lưu thông tin cửa (vé soát trước S-31)',
          },
          canOverride: Boolean(
            first && admissionOverridePolicy.approved && permission.canOverride,
          ),
        });
      }
      if (exception && !first) {
        throw new ConflictException({
          code: 'EXCEPTION_REQUIRES_FIRST_ADMISSION',
          message:
            'Chỉ cho vào lại theo ngoại lệ khi đã có lần vào thông thường được ghi nhận đầy đủ.',
        });
      }
      const [admission] = await tx.$queryRaw<Admission[]>(Prisma.sql`
        INSERT INTO ticket_admissions (id, "ticketId", "showtimeId", "gateId", "gateName", "staffId", "staffName", "requestId", kind, reason, "ownerConfirmed")
        VALUES (${randomUUID()}::uuid, ${ticketId}::uuid, ${showtimeId}::uuid, ${command.gateId}::uuid,
          ${permission.gateName}, ${request.user.id}::uuid, ${permission.staffName}, ${command.requestId}::uuid,
          ${kind}, ${command.reason ?? null}, ${exception})
        ON CONFLICT DO NOTHING RETURNING *`);
      if (!admission)
        throw new ConflictException({
          code: 'REQUEST_CONFLICT',
          message:
            'Yêu cầu đã được ghi nhận hoặc mã yêu cầu đang dùng cho hành động khác. Kiểm tra lại kết quả.',
        });
      if (!exception) {
        await tx.$executeRaw(
          Prisma.sql`UPDATE order_items SET "checkedInAt" = ${admission.enteredAt} WHERE id = ${ticketId}::uuid`,
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE tickets SET status='CHECKED_IN', "checkedInAt"=${admission.enteredAt}, "updatedAt"=clock_timestamp() WHERE "orderId"=${ticket.orderId}::uuid AND "seatId"=${ticket.seatId}::uuid`,
        );
      }
      return this.result(
        exception ? 'EXCEPTION_RECORDED' : 'SUCCESS',
        ticketId,
        ticket,
        admission,
      );
    });
  }

  private result(
    status: 'SUCCESS' | 'EXCEPTION_RECORDED' | 'ALREADY_RECORDED',
    ticketId: string,
    ticket: Ticket,
    admission: Admission,
  ) {
    return {
      status,
      ticketId,
      gateName: admission.gateName,
      kind: admission.kind,
      seat: {
        category: ticket.categoryName,
        row: ticket.row,
        number: ticket.seatNumber,
        label: `${ticket.row}-${ticket.seatNumber}`,
      },
      checkedInAt: admission.enteredAt.toISOString(),
    };
  }
}
