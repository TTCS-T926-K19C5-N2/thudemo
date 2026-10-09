import { randomBytes } from 'node:crypto';

export const TICKET_CODE_BYTES = 16;

// 128 random bits per ticket: codes carry no order, seat or sequence
// information, so one ticket's code reveals nothing about another's.
export function generateTicketCode(): string {
  return randomBytes(TICKET_CODE_BYTES).toString('base64url');
}
