import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// S-03: buyer self-registration by email (5 acceptance criteria).
describe('Buyer self-registration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ids: string[] = [];

  const GENERIC_REGISTER = 'Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn.';
  const GENERIC_RESEND =
    'Nếu email hợp lệ và chưa được xác nhận, bạn sẽ nhận được liên kết mới.';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.role.createMany({
      data: [{ name: 'BUYER' }],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  async function outbox(email: string): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get('/users/_dev/activation-outbox')
      .query({ email })
      .expect(200);
    return response.body.links as string[];
  }

  function tokenFromLink(link: string): string {
    return new URL(link).searchParams.get('token') ?? '';
  }

  it('AC1: creates a pending account and queues an activation email', async () => {
    const email = `s03-new-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    await request(app.getHttpServer())
      .post('/users/register')
      .send({ email, password })
      .expect(201)
      .expect((response) => {
        if (response.body.message !== GENERIC_REGISTER)
          throw new Error('Expected the generic registration message');
      });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    ids.push(user.id);
    expect(user.isEmailVerified).toBe(false);
    expect(user.activationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(
      user.activationExpires!.getTime() - Date.now(),
    ).toBeGreaterThan(23 * 3600 * 1000);
    const links = await outbox(email);
    expect(links).toHaveLength(1);
    expect(tokenFromLink(links[0])).toBe(user.activationToken);
  });

  it('AC2: never reveals whether the email already exists', async () => {
    const email = `s03-taken-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    await request(app.getHttpServer())
      .post('/users/register')
      .send({ email, password })
      .expect(201);
    ids.push((await prisma.user.findUniqueOrThrow({ where: { email } })).id);
    const before = await outbox(email);
    await request(app.getHttpServer())
      .post('/users/register')
      .send({ email, password: randomUUID() })
      .expect(201)
      .expect((response) => {
        if (response.body.message !== GENERIC_REGISTER)
          throw new Error('Existing email must get the same message');
      });
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    // No second activation email for an existing account.
    expect(await outbox(email)).toEqual(before);
  });

  it('AC3: rejects short, missing and malformed input on the server', async () => {
    const email = `s03-bad-${randomUUID()}@demo.invalid`;
    for (const body of [
      { email, password: 'short' },
      { email, password: '1234567' },
      { email },
      { email, password: '' },
      { email: 'not-an-email', password: randomUUID() },
      { email: '', password: randomUUID() },
      {},
    ]) {
      await request(app.getHttpServer())
        .post('/users/register')
        .send(body)
        .expect(400);
    }
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(await prisma.user.count({ where: { email: 'not-an-email' } })).toBe(0);
  });

  it('AC4: reports an expired link and accepts a re-sent link', async () => {
    const email = `s03-expired-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    const stale = randomBytes(32).toString('hex');
    const user = await prisma.user.create({
      data: {
        email,
        password: await argon2.hash(password, { type: argon2.argon2id }),
        isEmailVerified: false,
        activationToken: stale,
        activationExpires: new Date(Date.now() - 60_000),
        userRoles: { create: { role: { connect: { name: 'BUYER' } } } },
      },
    });
    ids.push(user.id);
    await request(app.getHttpServer())
      .get('/users/activate')
      .query({ token: stale })
      .expect(400)
      .expect((response) => {
        if (response.body.code !== 'ACTIVATION_EXPIRED')
          throw new Error('Expired link must report ACTIVATION_EXPIRED');
      });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .isEmailVerified,
    ).toBe(false);
    await request(app.getHttpServer())
      .post('/users/resend-activation')
      .send({ email })
      .expect(201)
      .expect((response) => {
        if (response.body.message !== GENERIC_RESEND)
          throw new Error('Expected the generic resend message');
      });
    const links = await outbox(email);
    expect(links).toHaveLength(1);
    const fresh = tokenFromLink(links[0]);
    expect(fresh).not.toBe(stale);
    await request(app.getHttpServer())
      .get('/users/activate')
      .query({ token: fresh })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
  });

  it('AC5: refuses login before activation with activation guidance', async () => {
    const email = `s03-pending-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    await request(app.getHttpServer())
      .post('/users/register')
      .send({ email, password })
      .expect(201);
    ids.push((await prisma.user.findUniqueOrThrow({ where: { email } })).id);
    // Correct password but unverified: 403 with guidance, not a plain 401.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(403)
      .expect((response) => {
        if (response.body.code !== 'ACCOUNT_NOT_ACTIVATED')
          throw new Error('Expected ACCOUNT_NOT_ACTIVATED guidance');
      });
    // Wrong password stays a plain 401.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: `wrong-${password}` })
      .expect(401);
    // After activation the same credentials work.
    const links = await outbox(email);
    await request(app.getHttpServer())
      .get('/users/activate')
      .query({ token: tokenFromLink(links[0]) })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
  });

  it('keeps the resend endpoint silent for unknown and verified emails', async () => {
    await request(app.getHttpServer())
      .post('/users/resend-activation')
      .send({ email: `s03-unknown-${randomUUID()}@demo.invalid` })
      .expect(201)
      .expect((response) => {
        if (response.body.message !== GENERIC_RESEND)
          throw new Error('Unknown email must get the same message');
      });
    const verified = `s03-verified-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    await request(app.getHttpServer())
      .post('/users/register')
      .send({ email: verified, password })
      .expect(201);
    ids.push(
      (await prisma.user.findUniqueOrThrow({ where: { email: verified } })).id,
    );
    const links = await outbox(verified);
    await request(app.getHttpServer())
      .get('/users/activate')
      .query({ token: tokenFromLink(links[0]) })
      .expect(200);
    const before = await outbox(verified);
    await request(app.getHttpServer())
      .post('/users/resend-activation')
      .send({ email: verified })
      .expect(201)
      .expect((response) => {
        if (response.body.message !== GENERIC_RESEND)
          throw new Error('Verified email must get the same message');
      });
    expect(await outbox(verified)).toEqual(before);
  });
});
