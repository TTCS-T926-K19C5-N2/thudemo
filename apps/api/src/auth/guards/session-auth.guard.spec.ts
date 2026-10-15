import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashSessionToken } from '../auth.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';

describe('session guard shared-pool read', () => {
  function fixture(
    headers: Record<string, string> = {
      cookie: `event_session=${'a'.repeat(43)}`,
    },
    isPublic = false,
  ) {
    const sessionQuery = vi
      .fn()
      .mockResolvedValue([
        { id: 'buyer', email: 'fixture@demo.invalid', roles: ['BUYER'] },
      ]);
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(isPublic) };
    const request = { headers, method: 'POST', user: undefined };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => {},
      getClass: () => {},
    } as unknown as ExecutionContext;
    const guard = new SessionAuthGuard(
      reflector as unknown as Reflector,
      { sessionQuery } as unknown as PrismaService,
    );
    return { guard, sessionQuery, context, request };
  }

  it('keeps the existing expiry, verified-user and role checks in parameterized SQL', async () => {
    const f = fixture();
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    const [sql] = f.sessionQuery.mock.calls[0];
    expect(sql.text).toContain('s."tokenHash"=$1');
    expect(sql.text).toContain('s."expiresAt">clock_timestamp()');
    expect(sql.text).toContain('u."isEmailVerified"=true');
    expect(sql.text).toContain('FROM user_roles ur JOIN roles r');
    expect(sql.values).toEqual([hashSessionToken('a'.repeat(43))]);
    expect(sql.text).not.toContain('a'.repeat(43));
    expect(f.request.user).toMatchObject({ roles: ['BUYER'] });
  });

  it('reads current roles again and rejects a subsequently revoked session without a result cache', async () => {
    const f = fixture();
    await f.guard.canActivate(f.context);
    f.sessionQuery.mockResolvedValueOnce([
      { id: 'buyer', email: 'fixture@demo.invalid', roles: [] },
    ]);
    await f.guard.canActivate(f.context);
    expect(f.request.user).toMatchObject({ roles: [] });
    f.sessionQuery.mockResolvedValueOnce([]);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 401,
    });
    expect(f.sessionQuery).toHaveBeenCalledTimes(3);
  });

  it('rejects malformed/missing cookies before reading the database', async () => {
    const f = fixture({ cookie: 'event_session=invalid' });
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 401,
    });
    expect(f.sessionQuery).not.toHaveBeenCalled();
  });

  it('preserves cross-origin rejection before the session query', async () => {
    const f = fixture({
      cookie: `event_session=${'a'.repeat(43)}`,
      origin: 'https://untrusted.invalid',
    });
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.sessionQuery).not.toHaveBeenCalled();
  });

  it('does not authenticate a public route', async () => {
    const f = fixture({}, true);
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    expect(f.sessionQuery).not.toHaveBeenCalled();
  });

  it('fails closed when the database session read fails', async () => {
    const f = fixture();
    f.sessionQuery.mockRejectedValueOnce(Error('connection failed'));
    await expect(f.guard.canActivate(f.context)).rejects.toThrow(
      'connection failed',
    );
    expect(f.request.user).toBeUndefined();
  });
});
