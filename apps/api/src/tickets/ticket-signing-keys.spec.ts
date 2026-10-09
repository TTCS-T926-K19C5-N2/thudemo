import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  EPHEMERAL_TICKET_KEY_ID,
  exportTicketPublicKey,
  loadTicketSigningKeys,
  validateTicketSigningConfig,
} from './ticket-signing-keys.js';
import { TicketSigningService } from './ticket-signing.service.js';
import type { ConfigService } from '@nestjs/config';

function ed25519Pair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateDer: pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    privatePem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicDer: exportTicketPublicKey(pair.publicKey),
  };
}

function configFrom(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

const SHOWTIME_ID = '11111111-1111-4111-8111-111111111111';

describe('loadTicketSigningKeys', () => {
  const k1 = ed25519Pair();
  const k2 = ed25519Pair();

  it('loads the active key from base64 DER', () => {
    const keys = loadTicketSigningKeys({
      TICKET_SIGNING_ACTIVE_KEY_ID: 'k1',
      TICKET_SIGNING_PRIVATE_KEY: k1.privateDer,
    });

    expect(keys.activeKeyId).toBe('k1');
    expect(keys.ephemeral).toBe(false);
    expect(exportTicketPublicKey(keys.publicKeys.get('k1')!)).toBe(k1.publicDer);
  });

  it('accepts a PEM key written on one line with escaped line breaks', () => {
    const keys = loadTicketSigningKeys({
      TICKET_SIGNING_ACTIVE_KEY_ID: 'k1',
      TICKET_SIGNING_PRIVATE_KEY: k1.privatePem.trim().replace(/\n/g, '\\n'),
    });

    expect(exportTicketPublicKey(keys.publicKeys.get('k1')!)).toBe(k1.publicDer);
  });

  it('keeps retired public keys next to the active key', () => {
    const keys = loadTicketSigningKeys({
      TICKET_SIGNING_ACTIVE_KEY_ID: 'k2',
      TICKET_SIGNING_PRIVATE_KEY: k2.privateDer,
      TICKET_SIGNING_PUBLIC_KEYS: JSON.stringify({ k1: k1.publicDer }),
    });

    expect([...keys.publicKeys.keys()].sort()).toEqual(['k1', 'k2']);
    expect(keys.activeKeyId).toBe('k2');
  });

  it('refuses to start in production without a signing key', () => {
    expect(() => validateTicketSigningConfig({ NODE_ENV: 'production' })).toThrow(
      /TICKET_SIGNING_PRIVATE_KEY/,
    );
    expect(() =>
      validateTicketSigningConfig({ APP_ENV: 'production', TICKET_SIGNING_PRIVATE_KEY: '' }),
    ).toThrow(/production/);
  });

  it('falls back to a temporary key outside production', () => {
    const keys = loadTicketSigningKeys({ NODE_ENV: 'development' });

    expect(keys.ephemeral).toBe(true);
    expect(keys.activeKeyId).toBe(EPHEMERAL_TICKET_KEY_ID);
    expect(keys.publicKeys.has(EPHEMERAL_TICKET_KEY_ID)).toBe(true);
  });

  it('rejects incomplete or invalid configuration', () => {
    const cases: Record<string, string | undefined>[] = [
      { TICKET_SIGNING_ACTIVE_KEY_ID: 'k1' },
      { TICKET_SIGNING_PRIVATE_KEY: k1.privateDer },
      { TICKET_SIGNING_ACTIVE_KEY_ID: 'k.1', TICKET_SIGNING_PRIVATE_KEY: k1.privateDer },
      { TICKET_SIGNING_ACTIVE_KEY_ID: 'k1', TICKET_SIGNING_PRIVATE_KEY: 'not-a-key' },
      {
        TICKET_SIGNING_ACTIVE_KEY_ID: 'k1',
        TICKET_SIGNING_PRIVATE_KEY: generateKeyPairSync('ec', { namedCurve: 'P-256' })
          .privateKey.export({ type: 'pkcs8', format: 'der' })
          .toString('base64'),
      },
      {
        TICKET_SIGNING_ACTIVE_KEY_ID: 'k1',
        TICKET_SIGNING_PRIVATE_KEY: k1.privateDer,
        TICKET_SIGNING_PUBLIC_KEYS: 'k0=abc',
      },
      {
        TICKET_SIGNING_ACTIVE_KEY_ID: 'k1',
        TICKET_SIGNING_PRIVATE_KEY: k1.privateDer,
        TICKET_SIGNING_PUBLIC_KEYS: JSON.stringify({ k0: 'not-a-key' }),
      },
      // The declared public key for the active keyId must match the private key.
      {
        TICKET_SIGNING_ACTIVE_KEY_ID: 'k1',
        TICKET_SIGNING_PRIVATE_KEY: k1.privateDer,
        TICKET_SIGNING_PUBLIC_KEYS: JSON.stringify({ k1: k2.publicDer }),
      },
    ];

    for (const env of cases) {
      expect(() => loadTicketSigningKeys(env), JSON.stringify(env)).toThrow(
        /^Không thể khởi động ứng dụng/,
      );
    }
  });
});

describe('TicketSigningService', () => {
  const k1 = ed25519Pair();
  const k2 = ed25519Pair();

  it('signs with the active key and verifies its own QR', () => {
    const service = new TicketSigningService(
      configFrom({ TICKET_SIGNING_ACTIVE_KEY_ID: 'k1', TICKET_SIGNING_PRIVATE_KEY: k1.privateDer }),
    );

    const issued = service.sign({ code: 'AbCdEfGhIjKlMnOpQrStUv', showtimeId: SHOWTIME_ID });

    expect(issued.keyId).toBe('k1');
    expect(issued.qrPayload).toBe(
      `v1.k1.AbCdEfGhIjKlMnOpQrStUv.${SHOWTIME_ID}.${issued.signature}`,
    );
    expect(service.verify(issued.qrPayload).valid).toBe(true);
  });

  it('still accepts tickets issued before a key rotation', () => {
    const before = new TicketSigningService(
      configFrom({ TICKET_SIGNING_ACTIVE_KEY_ID: 'k1', TICKET_SIGNING_PRIVATE_KEY: k1.privateDer }),
    );
    const oldTicket = before.sign({ code: 'AbCdEfGhIjKlMnOpQrStUv', showtimeId: SHOWTIME_ID });

    const after = new TicketSigningService(
      configFrom({
        TICKET_SIGNING_ACTIVE_KEY_ID: 'k2',
        TICKET_SIGNING_PRIVATE_KEY: k2.privateDer,
        TICKET_SIGNING_PUBLIC_KEYS: JSON.stringify({ k1: k1.publicDer }),
      }),
    );
    const newTicket = after.sign({ code: 'ZyXwVuTsRqPoNmLkJiHgFe', showtimeId: SHOWTIME_ID });

    expect(newTicket.keyId).toBe('k2');
    expect(after.verify(oldTicket.qrPayload).valid).toBe(true);
    expect(after.verify(newTicket.qrPayload).valid).toBe(true);
    expect(after.getPublicKeys()).toEqual(
      expect.arrayContaining([
        { keyId: 'k1', publicKey: k1.publicDer, active: false },
        { keyId: 'k2', publicKey: k2.publicDer, active: true },
      ]),
    );
  });

  it('rejects old tickets once their key is dropped from the public key list', () => {
    const before = new TicketSigningService(
      configFrom({ TICKET_SIGNING_ACTIVE_KEY_ID: 'k1', TICKET_SIGNING_PRIVATE_KEY: k1.privateDer }),
    );
    const oldTicket = before.sign({ code: 'AbCdEfGhIjKlMnOpQrStUv', showtimeId: SHOWTIME_ID });

    const after = new TicketSigningService(
      configFrom({ TICKET_SIGNING_ACTIVE_KEY_ID: 'k2', TICKET_SIGNING_PRIVATE_KEY: k2.privateDer }),
    );

    expect(after.verify(oldTicket.qrPayload)).toEqual({ valid: false, reason: 'UNKNOWN_KEY' });
  });
});
