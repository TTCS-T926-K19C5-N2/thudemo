export const TICKET_QR_VERSION = "ET1";
export const TICKET_QR_ALGORITHM = "Ed25519";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const keyId = /^[A-Za-z0-9_-]{1,32}$/;
export function ticketQrInput(value) {
  if (
    !keyId.test(value.keyId) ||
    !uuid.test(value.showtimeId) ||
    !uuid.test(value.ticketId)
  )
    throw new Error("Invalid QR identifiers");
  return [
    TICKET_QR_VERSION,
    TICKET_QR_ALGORITHM,
    value.keyId,
    value.showtimeId,
    value.ticketId,
  ].join(".");
}
export function parseTicketQr(value) {
  if (typeof value !== "string" || value.length > 256) return null;
  const parts = value.split(".");
  if (
    parts.length !== 6 ||
    parts[0] !== TICKET_QR_VERSION ||
    parts[1] !== TICKET_QR_ALGORITHM ||
    !keyId.test(parts[2]) ||
    !uuid.test(parts[3]) ||
    !uuid.test(parts[4]) ||
    !/^[A-Za-z0-9_-]{85}[AQgw]$/.test(parts[5])
  )
    return null;
  return {
    keyId: parts[2],
    showtimeId: parts[3],
    ticketId: parts[4],
    signature: parts[5],
    signingInput: parts.slice(0, 5).join("."),
  };
}
