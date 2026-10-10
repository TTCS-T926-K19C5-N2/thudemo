import { describe, it, expect } from 'vitest';
import { ScannerCryptoService } from './scanner-crypto.service.js';
import { ConfigService } from '@nestjs/config';

describe('ScannerCryptoService', () => {
  it('generates key pair, signs ticket, and verifies signature', () => {
    const config = new ConfigService();
    const service = new ScannerCryptoService(config);

    expect(service.getKeyId()).toBe('k1');
    const pubInfo = service.getPublicKeyInfo();
    expect(pubInfo.keyId).toBe('k1');
    expect(pubInfo.key).toContain('BEGIN PUBLIC KEY');

    const showtimeId = 'showtime-123';
    const code = 'TK-ABCXYZ';

    const sig = service.signTicket(code, showtimeId);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(10);

    // Verify valid signature
    const valid = service.verifyTicket(code, showtimeId, sig);
    expect(valid).toBe(true);

    // Fails on tampered code
    const invalidCode = service.verifyTicket('TK-DIFFERENT', showtimeId, sig);
    expect(invalidCode).toBe(false);

    // Fails on tampered showtime
    const invalidShowtime = service.verifyTicket(code, 'other-showtime', sig);
    expect(invalidShowtime).toBe(false);

    // Fails on corrupted signature
    const invalidSig = service.verifyTicket(code, showtimeId, 'bad-signature');
    expect(invalidSig).toBe(false);
  });
});
