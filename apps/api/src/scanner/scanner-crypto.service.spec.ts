import { describe, it, expect } from 'vitest';
import {
  generateKeyPairSync,
  createPublicKey,
  sign,
  webcrypto,
} from 'node:crypto';
import { ScannerCryptoService } from './scanner-crypto.service.js';
import { ConfigService } from '@nestjs/config';
import { parseTicketQr } from 'shared/ticket-qr';
const first = generateKeyPairSync('ed25519'),
  second = generateKeyPairSync('ed25519');
const pub = (pair: typeof first) =>
  pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const priv = (pair: typeof first) =>
  pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const id = '12345678-1234-4234-8234-123456789012',
  show = '87654321-1234-4234-8234-123456789012';
const config = (
  pair = first,
  kid = 'k1',
  ring: Record<string, string> = { k1: pub(first) },
) =>
  new ConfigService({
    SCANNER_KEY_ID: kid,
    SCANNER_SIGNING_PRIVATE_KEY: priv(pair),
    SCANNER_PUBLIC_KEYS: JSON.stringify(ring),
  });
describe('S-26/S-30 persistent Ed25519 QR', () => {
  it('signs canonical ticket/showtime/version/key, without personal data', () => {
    const service = new ScannerCryptoService(config());
    const qr = service.issueQr(id, show);
    expect(service.verifyQr(qr)).toMatchObject({
      ticketId: id,
      showtimeId: show,
      keyId: 'k1',
    });
    expect(qr.split('.').slice(0, 5)).toEqual([
      'ET1',
      'Ed25519',
      'k1',
      show,
      id,
    ]);
    expect(Object.keys(service.getPublicKeyInfo()).sort()).toEqual([
      'algorithm',
      'key',
      'keyId',
      'verificationKeys',
      'version',
    ]);
    expect(JSON.stringify(service.getPublicKeyInfo())).not.toContain('PRIVATE');
  });
  it.each([
    'payload',
    'signature',
    'unsigned',
    'unknown-key',
    'unknown-version',
    'wrong-algorithm',
    'noncanonical',
  ])('rejects %s', (kind) => {
    const service = new ScannerCryptoService(config());
    let qr = service.issueQr(id, show);
    if (kind === 'payload')
      qr = qr.replace(id, '22345678-1234-4234-8234-123456789012');
    if (kind === 'signature') {
      const p = qr.split('.');
      p[5] = (p[5][0] === 'A' ? 'B' : 'A') + p[5].slice(1);
      qr = p.join('.');
    }
    if (kind === 'unsigned') qr = id;
    if (kind === 'unknown-key') qr = qr.replace('.k1.', '.unknown.');
    if (kind === 'unknown-version') qr = qr.replace('ET1.', 'ET2.');
    if (kind === 'wrong-algorithm') qr = qr.replace('.Ed25519.', '.HS256.');
    if (kind === 'noncanonical') qr += '=';
    expect(() => service.verifyQr(qr)).toThrow();
  });
  it('rejects a known key ID signed by a different private key', () => {
    const service = new ScannerCryptoService(config());
    const qr = service.issueQr(id, show);
    const input = qr.split('.').slice(0, 5).join('.');
    expect(() =>
      service.verifyQr(
        input +
          '.' +
          sign(null, Buffer.from(input), second.privateKey).toString(
            'base64url',
          ),
      ),
    ).toThrow();
  });
  it('keeps old tickets after normal rotation, signs new tickets with k2', () => {
    const old = new ScannerCryptoService(config()).issueQr(id, show);
    const rotated = new ScannerCryptoService(
      config(second, 'k2', { k1: pub(first), k2: pub(second) }),
    );
    expect(rotated.verifyQr(old).keyId).toBe('k1');
    expect(rotated.verifyQr(rotated.issueQr(id, show)).keyId).toBe('k2');
  });
  it('restart uses persisted keys and verifier-only configuration has no signer', () => {
    const qr = new ScannerCryptoService(config()).issueQr(id, show);
    expect(new ScannerCryptoService(config()).verifyQr(qr).ticketId).toBe(id);
    const verifier = new ScannerCryptoService(
      new ConfigService({
        SCANNER_KEY_ID: 'k1',
        SCANNER_PUBLIC_KEYS: JSON.stringify({ k1: pub(first) }),
      }),
    );
    expect(verifier.verifyQr(qr).ticketId).toBe(id);
    expect(() => verifier.issueQr(id, show)).toThrow();
  });
  it('fails closed on missing/mismatched/invalid keys, never generates an application key', () => {
    const disabled = new ScannerCryptoService(new ConfigService({}));
    expect(() => disabled.issueQr(id, show)).toThrow();
    expect(() => disabled.verifyQr(id)).toThrow();
    expect(
      () =>
        new ScannerCryptoService(
          new ConfigService({
            SCANNER_KEY_ID: 'k1',
            SCANNER_SIGNING_PRIVATE_KEY: priv(first),
            SCANNER_PUBLIC_KEY: pub(second),
          }),
        ),
    ).toThrow('Invalid ticket QR key configuration');
    expect(
      () =>
        new ScannerCryptoService(
          new ConfigService({
            SCANNER_KEY_ID: 'k1',
            SCANNER_SIGNING_PRIVATE_KEY: 'not-a-key',
          }),
        ),
    ).toThrow('Invalid ticket QR key configuration');
  });
  it('the same canonical payload verifies through Web Crypto using public SPKI only', async () => {
    const qr = new ScannerCryptoService(config()).issueQr(id, show);
    const claims = parseTicketQr(qr)!;
    const publicKey = await webcrypto.subtle.importKey(
      'spki',
      createPublicKey(pub(first)).export({ type: 'spki', format: 'der' }),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    expect(
      await webcrypto.subtle.verify(
        'Ed25519',
        publicKey,
        Buffer.from(claims.signature, 'base64url'),
        Buffer.from(claims.signingInput),
      ),
    ).toBe(true);
  });
});
