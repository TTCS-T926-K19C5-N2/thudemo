import { vi } from 'vitest';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
const cryptoMock = vi.hoisted(() => ({ verify: vi.fn(), hash: vi.fn() }));
vi.mock('argon2', () => ({ ...cryptoMock, argon2id: 2 }));

describe('Login account and transport budgets', () => {
  function fixture() {
    cryptoMock.hash.mockResolvedValue('dummy-hash');
    cryptoMock.verify.mockReset().mockResolvedValue(true);
    const user = {
      id: 'owner',
      password: 'stored-hash',
      isEmailVerified: true,
      isActive: true,
    };
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([user]) },
      session: { create: vi.fn(), deleteMany: vi.fn() },
      $transaction: vi.fn(async (cb: any) => cb(prisma)),
      $queryRaw: vi.fn().mockResolvedValue([{ id: user.id }]),
    };
    const redis = {
      loginIpRetryAfter: vi.fn().mockResolvedValue(0),
      isAccountLocked: vi.fn().mockResolvedValue(false),
      getLockTTL: vi.fn().mockResolvedValue(890),
      recordLoginIpFailure: vi.fn(),
      incrementLoginFailures: vi.fn().mockResolvedValue(1),
      lockAccount: vi.fn(),
      clearLoginFailures: vi.fn(),
    };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
    return { service, prisma, redis, user };
  }
  it('normalizes identity, creates a hashed session and leaves the shared IP budget intact on success', async () => {
    const f = fixture();
    const session = await f.service.login(
      ' OWNER@EXAMPLE.INVALID ',
      'valid',
      '192.0.2.1',
    );
    expect(f.prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        email: { equals: 'owner@example.invalid', mode: 'insensitive' },
      },
      take: 2,
    });
    expect(f.prisma.session.create.mock.calls[0][0].data.tokenHash).not.toBe(
      session.token,
    );
    expect(f.redis.recordLoginIpFailure).not.toHaveBeenCalled();
    await f.service.logout(session.token);
    expect(f.prisma.session.deleteMany).toHaveBeenCalledTimes(2);
  });
  it.each([
    [null, 'x'],
    ['x', null],
    ['', 'x'],
    ['x', ''],
    ['x'.repeat(321), 'x'],
    ['x', 'x'.repeat(1025)],
  ])(
    'rejects malformed credentials before storage access (%s)',
    async (email, password) => {
      const f = fixture();
      await expect(
        f.service.login(email, password, '192.0.2.1'),
      ).rejects.toMatchObject({ status: 401 });
      expect(f.prisma.user.findMany).not.toHaveBeenCalled();
    },
  );
  it('rejects an exhausted IP before looking up an account', async () => {
    const f = fixture();
    f.redis.loginIpRetryAfter.mockResolvedValue(777);
    await expect(
      f.service.login('owner@example.invalid', 'valid', '192.0.2.1'),
    ).rejects.toMatchObject({
      status: 429,
      response: { retryAfterSeconds: 777 },
    });
    expect(f.prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('preserves account lockout even without an optional transport parameter', async () => {
    const f = fixture();
    f.redis.isAccountLocked.mockResolvedValue(true);
    f.redis.getLockTTL.mockResolvedValue(-1);
    await expect(
      f.service.login('owner@example.invalid', 'valid'),
    ).rejects.toMatchObject({
      status: 429,
      response: { retryAfterSeconds: 1 },
    });
    expect(f.redis.loginIpRetryAfter).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'ambiguous', 'password'])(
    'keeps one generic error and charges failed account/IP attempts for %s',
    async (reason) => {
      const f = fixture();
      if (reason === 'unknown') f.prisma.user.findMany.mockResolvedValue([]);
      if (reason === 'ambiguous')
        f.prisma.user.findMany.mockResolvedValue([f.user, f.user]);
      if (reason === 'password') cryptoMock.verify.mockResolvedValue(false);
      f.redis.incrementLoginFailures.mockResolvedValue(5);
      await expect(
        f.service.login('owner@example.invalid', 'invalid', '192.0.2.1'),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Email hoặc mật khẩu không đúng.',
      });
      expect(f.redis.recordLoginIpFailure).toHaveBeenCalledWith('192.0.2.1');
      expect(f.redis.lockAccount).toHaveBeenCalledWith('owner@example.invalid');
      expect(f.prisma.session.create).not.toHaveBeenCalled();
    },
  );
  it('gives activation guidance only after the correct password for an unverified account', async () => {
    const f = fixture();
    f.user.isEmailVerified = false;
    await expect(
      f.service.login('owner@example.invalid', 'valid', '192.0.2.1'),
    ).rejects.toMatchObject({
      status: 401,
      response: {
        code: 'EMAIL_NOT_VERIFIED',
        message: expect.stringContaining('chưa được kích hoạt'),
      },
    });
    expect(f.redis.clearLoginFailures).toHaveBeenCalledWith(
      'owner@example.invalid',
    );
    expect(f.redis.recordLoginIpFailure).not.toHaveBeenCalled();
    expect(f.prisma.session.create).not.toHaveBeenCalled();
  });
  it('rejects login for disabled account with administrator contact message (S-28 AC)', async () => {
    const f = fixture();
    f.user.isActive = false;
    await expect(
      f.service.login('owner@example.invalid', 'valid', '192.0.2.1'),
    ).rejects.toMatchObject({
      status: 401,
      response: {
        code: 'ACCOUNT_DISABLED',
        message: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.',
      },
    });
    expect(f.prisma.session.create).not.toHaveBeenCalled();
  });
  it.each(['precheck', 'failure-counter', 'clear-success'])(
    'fails closed when Redis fails at %s',
    async (phase) => {
      const f = fixture();
      if (phase === 'precheck')
        f.redis.loginIpRetryAfter.mockRejectedValue(new Error('private'));
      if (phase === 'failure-counter') {
        cryptoMock.verify.mockResolvedValue(false);
        f.redis.recordLoginIpFailure.mockRejectedValue(new Error('private'));
      }
      if (phase === 'clear-success')
        f.redis.clearLoginFailures.mockRejectedValue(new Error('private'));
      await expect(
        f.service.login('owner@example.invalid', 'x', '192.0.2.1'),
      ).rejects.toMatchObject({ status: 503 });
      expect(f.prisma.session.create).not.toHaveBeenCalled();
    },
  );
});
