import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { metrics } from '../monitoring/metrics.js';

export const TICKET_REJECTION = {
  WRONG_SHOWTIME: 'ERR_TICKET_WRONG_SHOWTIME',
  CANCELLED: 'ERR_TICKET_CANCELLED',
  UNKNOWN: 'ERR_TICKET_UNKNOWN',
  NOT_ELIGIBLE: 'ERR_TICKET_NOT_ELIGIBLE',
} as const;

export type TicketRejectionCode =
  (typeof TICKET_REJECTION)[keyof typeof TICKET_REJECTION];

export type RejectionContext = {
  showtimeId: string;
  gateId: string;
  staffId: string;
  requestId: string;
  ticketId?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

const logger = new Logger('TicketScan');

const viTime = (d: Date) =>
  d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

const viDate = (d: Date) =>
  d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

function record(reasonCode: TicketRejectionCode, ctx: RejectionContext) {
  // One structured line per rejection. Never log the QR payload or signature.
  logger.warn(
    JSON.stringify({ event: 'ticket_scan_rejected', reasonCode, ...ctx }),
  );
  metrics.rejectTicketScan(reasonCode);
}

export function unknownTicket(
  ctx: RejectionContext,
  code: 'INVALID_QR_SIGNATURE' | 'INVALID_TICKET' = 'INVALID_QR_SIGNATURE',
) {
  record(TICKET_REJECTION.UNKNOWN, ctx);
  return new BadRequestException({
    code,
    reasonCode: TICKET_REJECTION.UNKNOWN,
    message: 'Không phải vé của hệ thống.',
  });
}

export function wrongShowtime(
  ctx: RejectionContext,
  other: { eventName: string; startTime: Date },
) {
  record(TICKET_REJECTION.WRONG_SHOWTIME, ctx);
  return new BadRequestException({
    code: 'WRONG_SHOWTIME',
    reasonCode: TICKET_REJECTION.WRONG_SHOWTIME,
    message: `Vé của suất ${other.eventName} lúc ${viTime(other.startTime)}.`,
    ticketShowtime: {
      eventName: other.eventName,
      startTime: other.startTime.toISOString(),
    },
  });
}

export function cancelledTicket(
  ctx: RejectionContext,
  cancelledAt: Date | null,
) {
  record(TICKET_REJECTION.CANCELLED, ctx);
  return new NotFoundException({
    code: 'INVALID_TICKET',
    reasonCode: TICKET_REJECTION.CANCELLED,
    message: cancelledAt
      ? `Vé đã huỷ ngày ${viDate(cancelledAt)}.`
      : 'Vé đã huỷ.',
    cancelledAt: cancelledAt ? cancelledAt.toISOString() : null,
  });
}

export function notEligibleTicket(ctx: RejectionContext) {
  record(TICKET_REJECTION.NOT_ELIGIBLE, ctx);
  return new NotFoundException({
    code: 'INVALID_TICKET',
    reasonCode: TICKET_REJECTION.NOT_ELIGIBLE,
    message: 'Vé chưa đủ điều kiện vào.',
  });
}
