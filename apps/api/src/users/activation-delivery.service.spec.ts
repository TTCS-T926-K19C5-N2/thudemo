import { describe, expect, it } from 'vitest';
import {
  activationHash,
  decryptActivation,
  encryptActivation,
} from './activation-delivery.service.js';

describe('activation ciphertext contract', () => {
  const key = Buffer.alloc(32, 17);
  const token = 'a'.repeat(64);

  it('round trips AES-GCM ciphertext using the token hash as AAD', () => {
    const encrypted = encryptActivation(token, key);
    expect(decryptActivation(encrypted, activationHash(token), key)).toBe(token);
  });

  it.each([
    ['modified ciphertext', (encrypted: string) => {
      const bytes = Buffer.from(encrypted, 'base64url');
      bytes[12] ^= 1;
      return bytes.toString('base64url');
    }, activationHash(token), key],
    ['wrong key', (encrypted: string) => encrypted, activationHash(token), Buffer.alloc(32, 18)],
    ['wrong hash/AAD', (encrypted: string) => encrypted, activationHash('different'), key],
    ['truncated ciphertext', () => Buffer.alloc(5).toString('base64url'), activationHash(token), key],
  ])('rejects %s', (_name, mutate, hash, decryptionKey) => {
    const encrypted = encryptActivation(token, key);
    expect(() => decryptActivation(mutate(encrypted), hash, decryptionKey)).toThrow();
  });
});
