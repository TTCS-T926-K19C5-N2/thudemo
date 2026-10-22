import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MailService, type OutgoingMail } from '../src/mail/mail.service.js';
import { RegistrationSettings } from '../src/users/registration-settings.js';
import {
  ActivationDeliveryService,
  activationHash,
} from '../src/users/activation-delivery.service.js';
import { REGISTRATION_NOTICE } from 'shared/registration-notice';
import { LOGIN_PEER_HEADER, signLoginPeer } from 'shared/login-peer';
import { Redis } from 'ioredis';

describe('S03 registration, consent and durable activation (real PostgreSQL/Redis)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let delivery: ActivationDeliveryService;
  const prefix = `s03-${randomUUID()}`;
  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { keyPrefix: `${prefix}:` })
    : new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        keyPrefix: `${prefix}:`,
      });
  const sent: OutgoingMail[] = [];
  let failMail = false;
  const proxySecret = 'fixture-registration-peer-secret-at-least-32';
  let previousSecret: string | undefined;
  let peerIndex = 0;
  let peer = '192.0.2.1';
  beforeEach(() => {
    peer = `192.0.2.${++peerIndex}`;
  });
  const payload = (suffix: string) => ({
    email: `${prefix}-${suffix}@demo.invalid`,
    fullName: 'Người mua giả',
    password: `Fixture-${randomUUID()}`,
    consent: true,
    noticeVersion: REGISTRATION_NOTICE.version,
  });
  const tokenIn = (email: string) => {
    const token = sent
      .filter((mail) => mail.to === email)
      .at(-1)
      ?.text.match(/#token=([a-f0-9]{64})/)?.[1];
    expect(token).toHaveLength(64);
    return token!;
  };
  const register = (body: object) =>
    request(app.getHttpServer())
      .post('/users/register')
      .set(LOGIN_PEER_HEADER, signLoginPeer(peer, proxySecret))
      .send(body);
  const activate = (token: string, password = 'Activation-fixture-123') =>
    request(app.getHttpServer())
      .post('/users/activate')
      .send({ token, password });
  const resend = (email: string) =>
    request(app.getHttpServer())
      .post('/users/resend-activation')
      .set(LOGIN_PEER_HEADER, signLoginPeer(peer, proxySecret))
      .send({ email });

  beforeAll(async () => {
    previousSecret = process.env.AUTH_PROXY_SECRET;
    process.env.AUTH_PROXY_SECRET = proxySecret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('REDIS_CLIENT')
      .useValue(redis)
      .overrideProvider(MailService)
      .useValue({
        ready: true,
        send: async (mail: OutgoingMail) => {
          if (failMail)
            throw Error('Simulated provider failure: must never be logged');
          sent.push(mail);
        },
      })
      .overrideProvider(RegistrationSettings)
      .useValue({
        encryptionKey: Buffer.alloc(32, 8),
        publicOrigin: 'http://localhost:3000',
        worker: false,
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    delivery = app.get(ActivationDeliveryService);
    await db.role.createMany({
      data: [{ name: 'BUYER' }],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await db.consentEvent.deleteMany({where:{user:{email:{startsWith:prefix}}}});
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
    await redis.quit();
    if (previousSecret === undefined) delete process.env.AUTH_PROXY_SECRET;
    else process.env.AUTH_PROXY_SECRET = previousSecret;
  });

  it('publishes the approved notice and refuses invalid or missing consent without writes', async () => {
    const notice = await request(app.getHttpServer())
      .get('/users/registration-notice')
      .expect(200);
    expect(notice.body).toEqual(REGISTRATION_NOTICE);
    const input = payload('validation');
    for (const change of [
      { consent: false },
      { noticeVersion: 'old' },
      { fullName: '' },
      { email: 'invalid' },
      { password: '1234567' },
    ]) {
      const response = await register({ ...input, ...change }).expect(400);
      expect(Object.keys(response.body.errors)).toContain(
        Object.keys(change)[0] === 'noticeVersion'
          ? 'consent'
          : Object.keys(change)[0],
      );
    }
    expect(await db.user.count({ where: { email: input.email } })).toBe(0);
  });

  it('rolls back registration when consent persistence fails, then safely retries', async () => {
    const input = payload('consent-storage');
    const before = await db.activationToken.count();
    // A test-only trigger targets only this suite's fake address.
    // Keep real Prisma/PostgreSQL writes: a mocked transaction cannot prove rollback.
    const suffix = randomUUID().replaceAll('-', '');
    const name = `s03_consent_probe_${suffix}`;
    const email = input.email.replaceAll("'", "''");
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM users WHERE id = NEW."userId" AND email = '${email}') THEN
          RAISE EXCEPTION 'Simulated consent storage failure';
        END IF;
        RETURN NEW;
      END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON registration_consents
        FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      const response = await register(input).expect(503);
      expect(response.body.message).not.toContain(input.email);
      expect(await db.user.count({ where: { email: input.email } })).toBe(0);
      expect(await db.activationToken.count()).toBe(before);
      expect(sent.some((mail) => mail.to === input.email)).toBe(false);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS ${name} ON registration_consents`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
    await register(input).expect(201);
    const user = await db.user.findUniqueOrThrow({
      where: { email: input.email },
      include: { registrationConsent: true, activationTokens: true },
    });
    expect(user.registrationConsent?.noticeVersion).toBe(
      REGISTRATION_NOTICE.version,
    );
    expect(user.activationTokens).toHaveLength(1);
  });

  it('atomically creates only a pending BUYER, Argon2id, consent and a 24-hour hashed token', async () => {
    const input = payload('pending');
    await register(input).expect(201);
    const user = await db.user.findUniqueOrThrow({
      where: { email: input.email },
      include: {
        registrationConsent: true,
        activationTokens: { include: { mail: true } },
        userRoles: { include: { role: true } },
      },
    });
    expect(user.isEmailVerified).toBe(false);
    expect(user.fullName).toBe(input.fullName);
    expect(user.password).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(user.password, input.password)).toBe(true);
    expect(user.userRoles.map((r) => r.role.name)).toEqual(['BUYER']);
    expect(user.registrationConsent).toMatchObject({
      noticeVersion: REGISTRATION_NOTICE.version,
      purpose: REGISTRATION_NOTICE.purpose,
      status: 'GRANTED',
    });
    expect(user.registrationConsent!.acceptedAt).toBeInstanceOf(Date);
    const token = user.activationTokens[0];
    expect(
      token.expiresAt.getTime() - token.createdAt.getTime(),
    ).toBeGreaterThanOrEqual(86_399_000);
    expect(
      token.expiresAt.getTime() - token.createdAt.getTime(),
    ).toBeLessThanOrEqual(86_401_000);
    expect(user.activationToken).toBeNull();
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(401);
    for (let batch = 0; batch < 5; batch++) await delivery.drain();
    const raw = tokenIn(input.email);
    expect(token.tokenHash).toBe(activationHash(raw));
    expect(token.mail!.encryptedToken).not.toContain(raw);
    expect(
      (
        await db.activationMail.findUniqueOrThrow({
          where: { id: token.mail!.id },
        })
      ).encryptedToken,
    ).toBe('');
    await activate(raw, input.password).expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);
    const replay = await activate(raw).expect(400);
    expect(replay.body.code).toBe('ACTIVATION_USED');
  });

  it('normalizes email and serializes concurrent duplicate registration without changing existing credentials', async () => {
    const input = payload('race');
    const results = await Promise.all([
      register(input),
      register({
        ...input,
        email: ` ${input.email.toUpperCase()} `,
        password: 'Different-secret-123',
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(await db.user.count({ where: { email: input.email } })).toBe(1);
    const user = await db.user.findUniqueOrThrow({
      where: { email: input.email },
      include: { activationTokens: true },
    });
    expect(user.activationTokens).toHaveLength(1);
    const originalHash = user.password;
    await register({ ...input, password: 'Changed-secret-123' }).expect(201);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).password,
    ).toBe(originalHash);
  });

  it('rejects unknown and expired links, then permits resend without concurrent activation replay', async () => {
    const input = payload('expired');
    await register(input).expect(201);
    for (let batch = 0; batch < 5; batch++) await delivery.drain();
    const expired = tokenIn(input.email);
    await db.activationToken.update({
      where: { tokenHash: activationHash(expired) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await activate(expired).expect(400)).body.code).toBe(
      'ACTIVATION_EXPIRED',
    );
    expect((await activate('f'.repeat(64)).expect(400)).body.code).toBe(
      'ACTIVATION_INVALID',
    );
    await resend(input.email).expect(201);
    for (let batch = 0; batch < 5; batch++) await delivery.drain();
    const fresh = tokenIn(input.email);
    expect(fresh).not.toBe(expired);
    const results = await Promise.all([activate(fresh), activate(fresh)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(
      await db.activationToken.count({
        where: { user: { email: input.email }, consumedAt: null },
      }),
    ).toBe(0);
  });

  it('limits known and unknown emails identically to five resends per hour using shared Redis', async () => {
    const input = payload('budget');
    await register(input).expect(201);
    const ghost = payload('absent').email;
    for (let i = 0; i < 5; i++) {
      const [known, unknown] = await Promise.all([
        resend(input.email),
        resend(ghost),
      ]);
      expect([known.status, unknown.status]).toEqual([201, 201]);
      expect(known.body).toEqual(unknown.body);
    }
    for (const email of [input.email, ghost]) {
      const blocked = await resend(email).expect(429);
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(3500);
      expect(blocked.body.retryAfterSeconds).toBeLessThanOrEqual(3600);
    }
  });

  it('retains a failed mail for bounded retry and clears ciphertext only after delivery', async () => {
    const input = payload('retry');
    for (let batch = 0; batch < 5; batch++) await delivery.drain(); // clear prior suites' queued records before inducing failure
    await register(input).expect(201);
    failMail = true;
    try {
      for (let batch = 0; batch < 5; batch++) await delivery.drain();
    } finally {
      failMail = false;
    }
    let mail = await db.activationMail.findFirstOrThrow({
      where: { token: { user: { email: input.email } } },
    });
    expect(mail.status).toBe('QUEUED');
    expect(mail.attempts).toBe(1);
    expect(mail.encryptedToken.length).toBeGreaterThan(64);
    await db.activationMail.update({
      where: { id: mail.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    for (let batch = 0; batch < 5; batch++) await delivery.drain();
    mail = await db.activationMail.findUniqueOrThrow({
      where: { id: mail.id },
    });
    expect(mail.status).toBe('SENT');
    expect(mail.attempts).toBe(2);
    expect(mail.encryptedToken).toBe('');
    await activate(tokenIn(input.email)).expect(200);
  });

  it('recovers an expired final-attempt lease as FAILED instead of leaving SENDING forever', async () => {
    const input = payload('crashed-lease');
    await register(input).expect(201);
    const mail = await db.activationMail.findFirstOrThrow({
      where: { token: { user: { email: input.email } } },
    });
    await db.activationMail.update({
      where: { id: mail.id },
      data: {
        status: 'SENDING',
        attempts: 5,
        leaseUntil: new Date(Date.now() - 1000),
      },
    });
    for (let batch = 0; batch < 5; batch++) await delivery.drain();
    expect(
      await db.activationMail.findUniqueOrThrow({ where: { id: mail.id } }),
    ).toMatchObject({ status: 'FAILED', encryptedToken: '', leaseUntil: null });
  });

  it('prevents pending-account pre-hijack by binding credentials to mailbox activation', async () => {
    const input = payload('pre-hijack');
    const ownerPassword = `Owner-${randomUUID()}`;
    await register(input).expect(201);
    await register({ ...input, password: ownerPassword }).expect(201);
    for (let batch = 0; batch < 5; batch++) await delivery.drain();
    await activate(tokenIn(input.email), ownerPassword).expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: input.email, password: ownerPassword })
      .expect(200);
  });
});
