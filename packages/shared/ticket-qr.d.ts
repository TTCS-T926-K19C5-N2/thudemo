export const TICKET_QR_VERSION: "ET1";
export const TICKET_QR_ALGORITHM: "Ed25519";
export type TicketQrClaims = {
  keyId: string;
  showtimeId: string;
  ticketId: string;
};
export type ParsedTicketQr = TicketQrClaims & {
  signature: string;
  signingInput: string;
};
export type TicketQrPublicKey = { keyId: string; key: string };
export function ticketQrInput(value: TicketQrClaims): string;
export function parseTicketQr(value: unknown): ParsedTicketQr | null;
