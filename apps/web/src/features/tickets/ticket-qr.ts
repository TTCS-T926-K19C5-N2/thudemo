// Offline verification of ticket QR codes for the scanner. Mirrors the
// format produced by apps/api/src/tickets/ticket-qr.ts:
//   v1.<keyId>.<ticketCode>.<showtimeId>.<Ed25519 signature, base64url>
// Public keys come from GET /tickets/public-keys and are cached before
// going offline; keys of retired versions stay in the list so tickets
// issued before a rotation still verify.

export const TICKET_QR_VERSION = "v1";

const ED25519_SIGNATURE_BYTES = 64;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const TICKET_CODE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type TicketPublicKey = {
  keyId: string;
  // Base64 SPKI DER.
  publicKey: string;
};

export type SignedTicketQr = {
  keyId: string;
  code: string;
  showtimeId: string;
  signature: string;
};

export type TicketQrRejection = "MALFORMED" | "UNKNOWN_KEY" | "BAD_SIGNATURE";

export type TicketQrVerification =
  | { valid: true; ticket: SignedTicketQr }
  | { valid: false; reason: TicketQrRejection };

export type TicketVerificationKeys = ReadonlyMap<string, CryptoKey>;

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return base64ToBytes(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  } catch {
    return null;
  }
}

function signingInput(ticket: SignedTicketQr): string {
  return [TICKET_QR_VERSION, ticket.keyId, ticket.code, ticket.showtimeId].join(".");
}

export function parseTicketQr(raw: string): SignedTicketQr | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split(".");
  if (parts.length !== 5) return null;

  const [version, keyId, code, showtimeId, signature] = parts;
  if (version !== TICKET_QR_VERSION) return null;
  if (!KEY_ID_PATTERN.test(keyId)) return null;
  if (!TICKET_CODE_PATTERN.test(code)) return null;
  if (!UUID_PATTERN.test(showtimeId)) return null;
  if (!BASE64URL_PATTERN.test(signature)) return null;

  return { keyId, code, showtimeId, signature };
}

// Keys that fail to import (unknown format, unsupported browser) are left
// out, so QR codes signed with them are reported as UNKNOWN_KEY.
export async function importTicketPublicKeys(
  keys: readonly TicketPublicKey[],
): Promise<Map<string, CryptoKey>> {
  const imported = new Map<string, CryptoKey>();
  await Promise.all(
    keys.map(async ({ keyId, publicKey }) => {
      if (!KEY_ID_PATTERN.test(keyId)) return;
      try {
        const key = await crypto.subtle.importKey(
          "spki",
          base64ToBytes(publicKey),
          { name: "Ed25519" },
          false,
          ["verify"],
        );
        imported.set(keyId, key);
      } catch {
        // Skip: see function comment.
      }
    }),
  );
  return imported;
}

export async function verifyTicketQr(
  raw: string,
  keys: TicketVerificationKeys,
): Promise<TicketQrVerification> {
  const ticket = parseTicketQr(raw);
  if (!ticket) return { valid: false, reason: "MALFORMED" };

  const key = keys.get(ticket.keyId);
  if (!key) return { valid: false, reason: "UNKNOWN_KEY" };

  const signature = base64UrlToBytes(ticket.signature);
  // Only the canonical encoding is accepted: otherwise the unused low bits
  // of the last character could be edited without changing the signature.
  if (
    !signature ||
    signature.length !== ED25519_SIGNATURE_BYTES ||
    bytesToBase64Url(signature) !== ticket.signature
  ) {
    return { valid: false, reason: "BAD_SIGNATURE" };
  }

  try {
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signature,
      new TextEncoder().encode(signingInput(ticket)),
    );
    return ok ? { valid: true, ticket } : { valid: false, reason: "BAD_SIGNATURE" };
  } catch {
    return { valid: false, reason: "BAD_SIGNATURE" };
  }
}
