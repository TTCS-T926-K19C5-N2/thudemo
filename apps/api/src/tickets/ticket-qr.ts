import { sign, verify, type KeyObject } from 'node:crypto';

// QR payload: v1.<keyId>.<ticketCode>.<showtimeId>.<signature>
// The signature is Ed25519 over everything before the last dot, so changing
// any character of the payload invalidates it. The keyId tells the scanner
// which public key to use, which keeps tickets signed with retired keys valid.
export const TICKET_QR_VERSION = 'v1';
export const ED25519_SIGNATURE_BYTES = 64;

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const TICKET_CODE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface TicketQrClaims {
  keyId: string;
  code: string;
  showtimeId: string;
}

export interface SignedTicketQr extends TicketQrClaims {
  signature: string;
}

export type TicketQrRejection = 'MALFORMED' | 'UNKNOWN_KEY' | 'BAD_SIGNATURE';

export type TicketQrVerification =
  | { valid: true; ticket: SignedTicketQr }
  | { valid: false; reason: TicketQrRejection };

export function isValidTicketKeyId(keyId: string): boolean {
  return KEY_ID_PATTERN.test(keyId);
}

export function buildTicketQrSigningInput(claims: TicketQrClaims): string {
  return [
    TICKET_QR_VERSION,
    claims.keyId,
    claims.code,
    claims.showtimeId,
  ].join('.');
}

export function encodeTicketQr(ticket: SignedTicketQr): string {
  return `${buildTicketQrSigningInput(ticket)}.${ticket.signature}`;
}

export function parseTicketQr(raw: string): SignedTicketQr | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('.');
  if (parts.length !== 5) return null;

  const [version, keyId, code, showtimeId, signature] = parts;
  if (version !== TICKET_QR_VERSION) return null;
  if (!KEY_ID_PATTERN.test(keyId)) return null;
  if (!TICKET_CODE_PATTERN.test(code)) return null;
  if (!UUID_PATTERN.test(showtimeId)) return null;
  if (!BASE64URL_PATTERN.test(signature)) return null;

  return { keyId, code, showtimeId, signature };
}

export function signTicketQr(
  claims: TicketQrClaims,
  privateKey: KeyObject,
): SignedTicketQr {
  const signature = sign(
    null,
    Buffer.from(buildTicketQrSigningInput(claims), 'utf8'),
    privateKey,
  ).toString('base64url');
  return { ...claims, signature };
}

export function verifyTicketQr(
  raw: string,
  publicKeys: ReadonlyMap<string, KeyObject>,
): TicketQrVerification {
  const ticket = parseTicketQr(raw);
  if (!ticket) return { valid: false, reason: 'MALFORMED' };

  const publicKey = publicKeys.get(ticket.keyId);
  if (!publicKey) return { valid: false, reason: 'UNKNOWN_KEY' };

  const signature = Buffer.from(ticket.signature, 'base64url');
  // Base64url decoding ignores the unused low bits of the final character,
  // so a non-canonical encoding would let an edited QR decode to the same
  // signature bytes. Only the exact canonical encoding is accepted.
  if (
    signature.length !== ED25519_SIGNATURE_BYTES ||
    signature.toString('base64url') !== ticket.signature
  ) {
    return { valid: false, reason: 'BAD_SIGNATURE' };
  }

  try {
    const ok = verify(
      null,
      Buffer.from(buildTicketQrSigningInput(ticket), 'utf8'),
      publicKey,
      signature,
    );
    return ok ? { valid: true, ticket } : { valid: false, reason: 'BAD_SIGNATURE' };
  } catch {
    return { valid: false, reason: 'BAD_SIGNATURE' };
  }
}
