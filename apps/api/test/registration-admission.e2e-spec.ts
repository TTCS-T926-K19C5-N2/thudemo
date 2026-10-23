import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Redis } from 'ioredis';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { RegistrationSettings } from '../src/users/registration-settings.js';
import { REGISTRATION_NOTICE } from 'shared/registration-notice';
import { LOGIN_PEER_HEADER, signLoginPeer } from 'shared/login-peer';

it('isolates anonymous no-op mail admission by attested caller before consuming shared capacity', async () => {
  const prefix = `s03-admission-${randomUUID()}:`;
  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { keyPrefix: prefix })
    : new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        keyPrefix: prefix,
      });
  const originalSecret = process.env.AUTH_PROXY_SECRET;
  process.env.AUTH_PROXY_SECRET =
    'fixture-registration-proxy-secret-at-least-32';
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider('REDIS_CLIENT')
    .useValue(redis)
    .overrideProvider(MailService)
    .useValue({ ready: true, send: async () => {} })
    .overrideProvider(RegistrationSettings)
    .useValue({
      encryptionKey: Buffer.alloc(32, 4),
      publicOrigin: 'http://localhost:3000',
      worker: false,
    })
    .compile();
  const app = module.createNestApplication();
  const email = `${randomUUID()}@demo.invalid`;
  const db = app.get(PrismaService);
  try {
    await app.init();
    // Real shared Redis, new namespace, normal 1-hour TTL. No login/IP probe.
    for (let index = 0; index < 120; index++) {
      const response = await request(app.getHttpServer())
        .post('/users/resend-activation')
        .set(
          LOGIN_PEER_HEADER,
          signLoginPeer('192.0.2.31', process.env.AUTH_PROXY_SECRET),
        )
        .set('x-forwarded-for', `198.51.100.${index + 1}`)
        .send({ email: `${randomUUID()}@demo.invalid` });
      expect(response.status).toBe(index < 30 ? 201 : 429);
      if (index >= 30)
        expect(response.body.retryAfterSeconds).toBeGreaterThan(3500);
    }
    expect(await redis.get('auth:registration-delivery:hour')).toBe('30');
    expect(await redis.ttl('auth:registration-delivery:hour')).toBeGreaterThan(
      3500,
    );
    await db.role.createMany({
      data: [{ name: 'BUYER' }],
      skipDuplicates: true,
    });
    await request(app.getHttpServer())
      .post('/users/register')
      .set(
        LOGIN_PEER_HEADER,
        signLoginPeer('192.0.2.32', process.env.AUTH_PROXY_SECRET),
      )
      .send({
        email,
        fullName: 'Fixture giả',
        password: 'Fixture-password-123',
        consent: true,
        noticeVersion: REGISTRATION_NOTICE.version,
      })
      .expect(201);
    expect(await db.user.count({ where: { email } })).toBe(1);
    await request(app.getHttpServer())
      .post('/users/resend-activation')
      .set(LOGIN_PEER_HEADER, 'forged-attestation')
      .send({ email })
      .expect(403);
    expect(await redis.get('auth:registration-delivery:hour')).toBe('31');
  } finally {
    await db.consentEvent.deleteMany({where:{user:{email}}});
    await db.user.deleteMany({ where: { email } });
    await app.close();
    await redis.quit();
    if (originalSecret === undefined) delete process.env.AUTH_PROXY_SECRET;
    else process.env.AUTH_PROXY_SECRET = originalSecret;
  }
});
