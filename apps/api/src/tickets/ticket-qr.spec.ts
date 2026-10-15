import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import {
  buildTicketQrSigningInput,
  encodeTicketQr,
  parseTicketQr,
  signTicketQr,
  verifyTicketQr,
} from './ticket-qr.js';
import { generateTicketCode } from './ticket-code.js';
import { exportTicketPublicKey, loadTicketSigningKeys } from './ticket-signing-keys.js';

const SHOWTIME_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SHOWTIME_ID = '22222222-2222-4222-8222-222222222222';
const BASE64URL_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function issue(keyId: string, privateKey: KeyObject, code = generateTicketCode()) {
  return encodeTicketQr(signTicketQr({ keyId, code, showtimeId: SHOWTIME_ID }, privateKey));
}

describe('ticket QR signature', () => {
  const k1 = generateKeyPairSync('ed25519');
  const keys = new Map([['k1', k1.publicKey]]);

  it('accepts a genuine QR and returns its claims', () => {
    const code = generateTicketCode();
    const qr = issue('k1', k1.privateKey, code);

    const result = verifyTicketQr(qr, keys);

    expect(result).toEqual({
      valid: true,
      ticket: expect.objectContaining({ keyId: 'k1', code, showtimeId: SHOWTIME_ID }),
    });
  });

  it('rejects the QR when any single character is changed', () => {
    const qr = issue('k1', k1.privateKey);
    const accepted: string[] = [];

    for (let i = 0; i < qr.length; i++) {
      for (const replacement of [BASE64URL_CHARS[0], BASE64URL_CHARS[63], '.']) {
        if (qr[i] === replacement) continue;
        const tampered = qr.slice(0, i) + replacement + qr.slice(i + 1);
        if (verifyTicketQr(tampered, keys).valid) accepted.push(tampered);
      }
    }

    expect(accepted).toEqual([]);
  });

  it('rejects a non-canonical signature that decodes to the same bytes', () => {
    const qr = issue('k1', k1.privateKey);
    const last = qr.at(-1)!;
    // The final base64url character of a 64-byte value carries 2 unused bits.
    const index = BASE64URL_CHARS.indexOf(last);
    const twin = BASE64URL_CHARS[index ^ 0b01];
    const tampered = qr.slice(0, -1) + twin;

    expect(verifyTicketQr(tampered, keys)).toEqual({ valid: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a signature moved onto another ticket code or showtime', () => {
    const genuine = signTicketQr(
      { keyId: 'k1', code: generateTicketCode(), showtimeId: SHOWTIME_ID },
      k1.privateKey,
    );

    const otherCode = encodeTicketQr({ ...genuine, code: generateTicketCode() });
    const otherShowtime = encodeTicketQr({ ...genuine, showtimeId: OTHER_SHOWTIME_ID });

    expect(verifyTicketQr(otherCode, keys).valid).toBe(false);
    expect(verifyTicketQr(otherShowtime, keys).valid).toBe(false);
  });

  it('rejects a self-made QR with a valid ticket code but no signature', () => {
    const claims = { keyId: 'k1', code: generateTicketCode(), showtimeId: SHOWTIME_ID };
    const unsigned = buildTicketQrSigningInput(claims);

    expect(verifyTicketQr(unsigned, keys)).toEqual({ valid: false, reason: 'MALFORMED' });
    expect(verifyTicketQr(`${unsigned}.`, keys)).toEqual({ valid: false, reason: 'MALFORMED' });
    expect(verifyTicketQr(claims.code, keys)).toEqual({ valid: false, reason: 'MALFORMED' });
  });

  it('rejects a self-made QR whose signature is made up', () => {
    const forged = encodeTicketQr({
      keyId: 'k1',
      code: generateTicketCode(),
      showtimeId: SHOWTIME_ID,
      signature: Buffer.alloc(64, 7).toString('base64url'),
    });

    expect(verifyTicketQr(forged, keys)).toEqual({ valid: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a QR signed with a key the system does not know', () => {
    const attacker = generateKeyPairSync('ed25519');

    expect(verifyTicketQr(issue('k9', attacker.privateKey), keys)).toEqual({
      valid: false,
      reason: 'UNKNOWN_KEY',
    });
    // Same keyId as a real key does not help without the real private key.
    expect(verifyTicketQr(issue('k1', attacker.privateKey), keys)).toEqual({
      valid: false,
      reason: 'BAD_SIGNATURE',
    });
  });

  it('keeps tickets signed with a retired key valid after rotation', () => {
    const k2 = generateKeyPairSync('ed25519');
    const beforeRotation = issue('k1', k1.privateKey);
    const afterRotation = issue('k2', k2.privateKey);
    const rotatedKeys = new Map([
      ['k1', k1.publicKey],
      ['k2', k2.publicKey],
    ]);

    expect(verifyTicketQr(beforeRotation, rotatedKeys).valid).toBe(true);
    expect(verifyTicketQr(afterRotation, rotatedKeys).valid).toBe(true);
    // Relabelling an old signature with the new keyId does not verify.
    expect(verifyTicketQr(beforeRotation.replace('.k1.', '.k2.'), rotatedKeys).valid).toBe(false);
  });

  it('rejects other QR formats', () => {
    const qr = issue('k1', k1.privateKey);
    for (const raw of [
      '',
      qr.replace(/^v1\./, 'v2.'),
      `${qr}.extra`,
      qr.replace(SHOWTIME_ID, 'not-a-uuid'),
      ` ${qr}`,
    ]) {
      expect(verifyTicketQr(raw, keys).valid).toBe(false);
    }
  });

  it('rejects an upper-cased showtime id', () => {
    const showtimeId = 'abcdef12-3456-4789-8abc-def123456789';
    const qr = encodeTicketQr(
      signTicketQr({ keyId: 'k1', code: generateTicketCode(), showtimeId }, k1.privateKey),
    );

    expect(verifyTicketQr(qr, keys).valid).toBe(true);
    expect(verifyTicketQr(qr.replace(showtimeId, showtimeId.toUpperCase()), keys)).toEqual({
      valid: false,
      reason: 'MALFORMED',
    });
  });

  it('parses only the exact five-part format', () => {
    const qr = issue('k1', k1.privateKey);
    expect(parseTicketQr(qr)).not.toBeNull();
    expect(parseTicketQr(qr.split('.').slice(0, 4).join('.'))).toBeNull();
  });
});

// Shared with apps/web/src/features/tickets/ticket-qr.spec.ts so the API
// signer and the browser scanner stay on the same format. Ed25519 is
// deterministic: this key always yields this exact QR.
const TICKET_QR_TEST_VECTOR = {
  privateKey: 'MC4CAQAwBQYDK2VwBCIEICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioq',
  publicKey: 'MCowBQYDK2VwAyEAGX9rI+FshTLGq8g4+s1ep4m+DHaykgM0A5v6iz02jWE=',
  qr: 'v1.k1.AbCdEfGhIjKlMnOpQrStUv.11111111-1111-4111-8111-111111111111.JoXt5VfMXa37LHcTCundi7kCSTABJlocpSP61-XQ66A8q1kSR5LbwyhMoUARfiXF6RIXhdbCeB59l6v1PPTUDw',
};

describe('ticket QR test vector', () => {
  it('signs to the exact QR the web scanner expects', () => {
    const keys = loadTicketSigningKeys({
      TICKET_SIGNING_ACTIVE_KEY_ID: 'k1',
      TICKET_SIGNING_PRIVATE_KEY: TICKET_QR_TEST_VECTOR.privateKey,
    });
    const signed = signTicketQr(
      { keyId: 'k1', code: 'AbCdEfGhIjKlMnOpQrStUv', showtimeId: SHOWTIME_ID },
      keys.privateKey,
    );

    expect(encodeTicketQr(signed)).toBe(TICKET_QR_TEST_VECTOR.qr);
    expect(exportTicketPublicKey(keys.publicKeys.get('k1')!)).toBe(TICKET_QR_TEST_VECTOR.publicKey);
  });
});

describe('generateTicketCode', () => {
  it('produces 128-bit base64url codes that do not repeat', () => {
    const codes = Array.from({ length: 1000 }, generateTicketCode);

    for (const code of codes) {
      expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(Buffer.from(code, 'base64url')).toHaveLength(16);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});
