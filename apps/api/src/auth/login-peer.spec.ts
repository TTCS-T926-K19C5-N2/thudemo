import {
  canonicalPeer,
  signLoginPeer,
  verifyLoginPeer,
  isLoginProxyPath,
  isPeerProtectedProxyPath,
} from 'shared/login-peer';
describe('Login transport peer attestation', () => {
  const secret = 'fixture-only-key-with-at-least-32-random-characters';
  it('requires transport peer for registration variants while preserving login classification', () => {
    for (const path of [
      '/api/users/register',
      '/api/USERS/REGISTER/',
      '/api/%75sers/resend-activation',
    ]) {
      expect(isPeerProtectedProxyPath(path)).toBe(true);
      expect(isLoginProxyPath(path)).toBe(false);
    }
    expect(isPeerProtectedProxyPath('/api/auth/login')).toBe(true);
    expect(isPeerProtectedProxyPath('/api/users/activate')).toBe(false);
    expect(isPeerProtectedProxyPath('/api/users/register/other')).toBe(false);
  });
  it('classifies all equivalent login spellings before choosing the peer boundary', () => {
    for (const path of [
      '/api/auth/login',
      '/api/Auth/LOGIN',
      '/api/auth/login/',
      '/api/%61uth/login',
    ])
      expect(isLoginProxyPath(path)).toBe(true);
    for (const path of [
      '/api/auth/logout',
      '/api/auth/login/other',
      '/auth/login',
      '//api/auth/login',
    ])
      expect(isLoginProxyPath(path)).toBe(false);
    expect(() => isLoginProxyPath('/api/%zz/login')).toThrow();
  });
  it('canonicalizes mapped IPv4 and verifies a fresh signed peer', () => {
    const now = 1800000000000;
    expect(canonicalPeer('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(
      verifyLoginPeer(
        signLoginPeer('::ffff:127.0.0.1', secret, now),
        secret,
        now,
      ),
    ).toBe('127.0.0.1');
  });
  it('rejects spoofing, replay after 30 seconds and invalid transport values', () => {
    const now = 1800000000000,
      token = signLoginPeer('192.0.2.1', secret, now);
    expect(() => verifyLoginPeer(token, secret, now + 31000)).toThrow();
    expect(() => verifyLoginPeer(token, secret + 'different', now)).toThrow();
    expect(() =>
      verifyLoginPeer(token.replace(/.$/, '!'), secret, now),
    ).toThrow();
    expect(() =>
      signLoginPeer('arbitrary forwarded text', secret, now),
    ).toThrow();
    expect(() => signLoginPeer('127.0.0.1', 'placeholder', now)).toThrow();
  });
  it('rejects alternative encodings, malformed fields and future tokens', () => {
    const now = 1800000000000;
    for (const header of [
      undefined,
      [],
      'x'.repeat(201),
      'a.b',
      'a'.repeat(3) + '.' + 'A'.repeat(43),
    ]) {
      expect(() => verifyLoginPeer(header, secret, now)).toThrow();
    }
    for (const value of [
      '1800000000|192.0.2.1|extra',
      'bad|192.0.2.1',
      '1800000000|::FFFF:127.0.0.1',
      '1800000000|not-ip',
    ]) {
      const token =
        Buffer.from(value).toString('base64url') + '.' + 'A'.repeat(43);
      expect(() => verifyLoginPeer(token, secret, now)).toThrow();
    }
    expect(() =>
      verifyLoginPeer(signLoginPeer('::1', secret, now + 31000), secret, now),
    ).toThrow();
    expect(
      verifyLoginPeer(signLoginPeer('2001:DB8::1', secret, now), secret, now),
    ).toBe('2001:db8::1');
    expect(() => canonicalPeer(undefined)).toThrow();
    expect(() => signLoginPeer('127.0.0.1', undefined, now)).toThrow();
    expect(() =>
      signLoginPeer('127.0.0.1', '<' + 'x'.repeat(32), now),
    ).toThrow();
  });
});
