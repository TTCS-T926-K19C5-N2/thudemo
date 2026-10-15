import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Existing account input regressions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ids: string[] = [];

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

  async function fixture(email: string, verified = false, expired = false) {
    const password = randomUUID();
    const token = randomBytes(32).toString('hex');
    const user = await prisma.user.create({
      data: {
        email,
        password: await argon2.hash(password, { type: argon2.argon2id }),
        isEmailVerified: verified,
        activationToken: verified ? null : token,
        activationExpires: new Date(Date.now() + (expired ? -60_000 : 60_000)),
        userRoles: { create: { role: { connect: { name: 'BUYER' } } } },
      },
    });
    ids.push(user.id);
    return { user, password, token };
  }

  it('allows an existing mixed-case email to log in without rewriting identity', async () => {
    const { user, password } = await fixture(
      `Buyer-${randomUUID()}@demo.invalid`,
      true,
    );
    for (const email of [user.email, user.email.toLowerCase()]) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
    }
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
    ).toBe(user.email);
  });

  it('does not select an identity when legacy email casing is ambiguous', async () => {
    const email = `Buyer-${randomUUID()}@demo.invalid`;
    const first = await fixture(email, true);
    const second = await fixture(email.toLowerCase(), true);
    for (const candidate of [first, second]) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: candidate.user.email, password: candidate.password })
        .expect(401);
    }
    expect(
      await prisma.session.count({
        where: { userId: { in: [first.user.id, second.user.id] } },
      }),
    ).toBe(0);
  });

  it('can log in after the existing mixed-case registration and activation flow', async () => {
    const email = `Registered-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    await request(app.getHttpServer())
      .post('/users/register')
      .send({ email, password })
      .expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    ids.push(user.id);
    await request(app.getHttpServer())
      .get('/users/activate')
      .query({ token: user.activationToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
  });

  it('rejects missing, empty, malformed and repeated token parameters without verification', async () => {
    const { user, token } = await fixture(
      `activation-${randomUUID()}@demo.invalid`,
    );
    for (const url of [
      '/users/activate',
      '/users/activate?token=',
      '/users/activate?token=no',
      `/users/activate?token=${token}&token=${token}`,
    ]) {
      await request(app.getHttpServer()).get(url).expect(400);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .isEmailVerified,
      ).toBe(false);
    }
  });

  it('rejects expired tokens without changing the account', async () => {
    const { user, token } = await fixture(
      `expired-${randomUUID()}@demo.invalid`,
      false,
      true,
    );
    await request(app.getHttpServer())
      .get('/users/activate')
      .query({ token })
      .expect(400);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .isEmailVerified,
    ).toBe(false);
  });

  it('activates a valid token once and rejects reuse and concurrent replay', async () => {
    const { user, token } = await fixture(`valid-${randomUUID()}@demo.invalid`);
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app.getHttpServer()).get('/users/activate').query({ token }),
      ),
    );
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 400]);
    await request(app.getHttpServer())
      .get('/users/activate')
      .query({ token })
      .expect(400);
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(current.isEmailVerified).toBe(true);
    expect(current.activationToken).toBeNull();
  });
});
