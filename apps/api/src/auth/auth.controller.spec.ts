import { afterEach, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './guards/session-auth.guard.js';
import type { Response } from 'express';
import { signLoginPeer, LOGIN_PEER_HEADER } from 'shared/login-peer';
afterEach(() => vi.unstubAllEnvs());
describe('Login API transport identity', () => {
  const secret = 'fixture-only-secret-with-at-least-32-characters';
  it('accepts the verified web peer and sets a secure HTTP-only production cookie', async () => {
    vi.stubEnv('AUTH_PROXY_SECRET', secret);
    vi.stubEnv('NODE_ENV', 'production');
    const login = vi.fn().mockResolvedValue({
      token: 'fixture',
      expiresAt: new Date('2099-01-01Z'),
    });
    const controller = new AuthController({ login } as unknown as AuthService);
    const request = {
      headers: { [LOGIN_PEER_HEADER]: signLoginPeer('192.0.2.1', secret) },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as AuthenticatedRequest;
    const cookie = vi.fn();
    await controller.login({ email: 'a', password: 'b' }, request, {
      cookie,
    } as unknown as Response);
    expect(login).toHaveBeenCalledWith('a', 'b', '192.0.2.1');
    expect(cookie).toHaveBeenCalledWith(
      'event_session',
      'fixture',
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 900000,
      }),
    );
  });
  it.each(['forged', ['duplicate', 'header']])(
    'denies invalid peer metadata before calling the service (%s)',
    async (header) => {
      const login = vi.fn();
      const controller = new AuthController({
        login,
      } as unknown as AuthService);
      await expect(
        controller.login(
          {},
          {
            headers: { [LOGIN_PEER_HEADER]: header },
            socket: { remoteAddress: '127.0.0.1' },
          } as unknown as AuthenticatedRequest,
          {} as Response,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(login).not.toHaveBeenCalled();
    },
  );
  it('uses the socket on direct API calls and delegates malformed credentials to the service', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const login = vi
      .fn()
      .mockResolvedValue({ token: 'fixture', expiresAt: new Date() });
    const cookie = vi.fn();
    await new AuthController({ login } as unknown as AuthService).login(
      null,
      {
        headers: {},
        socket: { remoteAddress: '::ffff:127.0.0.4' },
      } as unknown as AuthenticatedRequest,
      { cookie } as unknown as Response,
    );
    expect(login).toHaveBeenCalledWith(undefined, undefined, '127.0.0.4');
    expect(cookie.mock.calls[0][2].secure).toBe(false);
  });
});
