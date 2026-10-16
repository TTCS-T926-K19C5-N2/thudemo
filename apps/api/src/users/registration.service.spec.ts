import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { RegistrationService } from './registration.service.js';
import { RegistrationSettings } from './registration-settings.js';
import { REGISTRATION_NOTICE } from 'shared/registration-notice';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import type { ActivationDeliveryService } from './activation-delivery.service.js';

describe('S03 validation and configuration boundaries', () => {
  const valid = {
    email: 'fixture@demo.invalid',
    fullName: 'Người thử giả',
    password: 'Fixture-only-123',
    consent: true,
    noticeVersion: REGISTRATION_NOTICE.version,
  };
  it.each([
    [{ email: '' }, 'email'],
    [{ email: 'invalid' }, 'email'],
    [{ fullName: '' }, 'fullName'],
    [{ fullName: 'bad\nname' }, 'fullName'],
    [{ password: 'short' }, 'password'],
    [{ password: null }, 'password'],
    [{ consent: false }, 'consent'],
    [{ noticeVersion: 'old' }, 'consent'],
  ])(
    'rejects invalid fields before database access: %j',
    async (change, field) => {
      const tx = vi.fn();
      const service = new RegistrationService(
        { $transaction: tx } as unknown as PrismaService,
        {} as RedisService,
        { available: true } as ActivationDeliveryService,
        {} as RegistrationSettings,
      );
      await expect(
        service.register({ ...valid, ...change }),
      ).rejects.toMatchObject({
        response: { errors: { [field as string]: expect.any(String) } },
      });
      expect(tx).not.toHaveBeenCalled();
    },
  );

  it('fails registration closed when delivery is not configured, without creating an account', async () => {
    const tx = vi.fn();
    const service = new RegistrationService(
      { $transaction: tx } as unknown as PrismaService,
      {} as RedisService,
      { available: false } as ActivationDeliveryService,
      {} as RegistrationSettings,
    );
    await expect(service.register(valid)).rejects.toMatchObject({
      status: 503,
    });
    expect(tx).not.toHaveBeenCalled();
  });

  it('requires a canonical 256-bit key and a fixed trusted origin, never a caller redirect', () => {
    const key = Buffer.alloc(32, 1).toString('base64url');
    const settings = (origin: string, raw = key) =>
      new RegistrationSettings(
        new ConfigService({
          REGISTRATION_MAIL_KEY: raw,
          REGISTRATION_PUBLIC_ORIGIN: origin,
        }),
      );
    expect(settings('https://10.88.164.155:3470').publicOrigin).toBe(
      'https://10.88.164.155:3470',
    );
    expect(settings('http://localhost:3000').publicOrigin).toBe(
      'http://localhost:3000',
    );
    for (const origin of [
      'https://allowed.invalid/redirect',
      'https://user:password@allowed.invalid',
      'http://public.invalid',
      'https://allowed.invalid/?next=https://other.invalid',
    ])
      expect(settings(origin).publicOrigin).toBeNull();
    expect(settings('http://localhost', key + '=')).toMatchObject({
      encryptionKey: null,
    });
  });
});
