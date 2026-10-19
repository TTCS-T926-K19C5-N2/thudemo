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

  it('rejects excess global delivery before Argon2/account/outbox work on either public route', async () => {
    const tx = vi.fn();
    const redis = {
      reserveRegistrationCaller: vi
        .fn()
        .mockResolvedValue({ count: 1, ttl: 3600 }),
      reserveRegistrationDelivery: vi
        .fn()
        .mockResolvedValue({ count: 121, ttl: 3550 }),
      reserveActivationResend: vi.fn(),
    };
    const service = new RegistrationService(
      { $transaction: tx } as unknown as PrismaService,
      redis as unknown as RedisService,
      { available: true } as ActivationDeliveryService,
      {} as RegistrationSettings,
    );
    for (const operation of [
      () => service.register(valid),
      () => service.resend(valid.email),
    ])
      await expect(operation()).rejects.toMatchObject({
        status: 429,
        response: { retryAfterSeconds: 3550 },
      });
    expect(tx).not.toHaveBeenCalled();
    expect(redis.reserveActivationResend).not.toHaveBeenCalled();
  });

  it('fails mail-producing routes closed when shared admission storage is unavailable', async () => {
    const tx = vi.fn();
    const redis = {
      reserveRegistrationCaller: vi
        .fn()
        .mockResolvedValue({ count: 1, ttl: 3600 }),
      reserveRegistrationDelivery: vi
        .fn()
        .mockRejectedValue(new Error('Private provider detail')),
    };
    const service = new RegistrationService(
      { $transaction: tx } as unknown as PrismaService,
      redis as unknown as RedisService,
      { available: true } as ActivationDeliveryService,
      {} as RegistrationSettings,
    );
    await expect(service.register(valid)).rejects.toMatchObject({
      status: 503,
    });
    expect(tx).not.toHaveBeenCalled();
  });

  it('rejects a caller before debiting global SMTP capacity and fails closed on caller storage errors', async () => {
    const tx = vi.fn();
    const redis = {
      reserveRegistrationCaller: vi
        .fn()
        .mockResolvedValue({ count: 31, ttl: 3500 }),
      reserveRegistrationDelivery: vi.fn(),
    };
    const service = new RegistrationService(
      { $transaction: tx } as unknown as PrismaService,
      redis as unknown as RedisService,
      { available: true } as ActivationDeliveryService,
      {} as RegistrationSettings,
    );
    for (const work of [
      () => service.register(valid, '192.0.2.1'),
      () => service.resend(valid.email, '192.0.2.1'),
    ])
      await expect(work()).rejects.toMatchObject({
        status: 429,
        response: { retryAfterSeconds: 3500 },
      });
    redis.reserveRegistrationCaller.mockRejectedValue(
      new Error('private Redis detail'),
    );
    await expect(service.register(valid, '192.0.2.1')).rejects.toMatchObject({
      status: 503,
    });
    expect(redis.reserveRegistrationDelivery).not.toHaveBeenCalled();
    expect(tx).not.toHaveBeenCalled();
  });
});
