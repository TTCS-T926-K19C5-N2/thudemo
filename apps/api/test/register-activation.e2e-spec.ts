import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('S-03 Buyer Self-Registration and Activation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-3: rejects registration when password has fewer than 8 characters', async () => {
    const shortPassword = 'short';
    const email = `buyer-${randomUUID()}@demo.invalid`;

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: shortPassword })
      .expect(400);

    expect(res.body.errors).toHaveProperty('password');
    expect(res.body.errors.password).toContain('8');
  });

  it('AC-1: registers buyer in pending state and provides activation token', async () => {
    const email = `buyer-${randomUUID()}@demo.invalid`;
    const password = 'StrongPassword123!';

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.message).toContain('kích hoạt');

    const created = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } },
    });
    expect(created).not.toBeNull();
    expect(created?.isEmailVerified).toBe(false);
    expect(created?.activationToken).toBeTruthy();
    expect(created?.activationExpires).toBeTruthy();
    expect(
      created?.userRoles.some((ur) => ur.role.name === 'BUYER'),
    ).toBe(true);
  });

  it('AC-2: returns generic message without revealing if email already exists', async () => {
    const email = `buyer-${randomUUID()}@demo.invalid`;
    const password = 'StrongPassword123!';

    // Register first time
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(200);

    // Register second time with identical email
    const duplicateRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'DifferentPassword123!' })
      .expect(200);

    expect(duplicateRes.body.status).toBe('ok');
    expect(duplicateRes.body.message).toContain('kích hoạt');
  });

  it('AC-5: denies login if account is not yet activated', async () => {
    const email = `buyer-${randomUUID()}@demo.invalid`;
    const password = 'StrongPassword123!';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);

    expect(loginRes.body.message).toContain('chưa được kích hoạt');
  });

  it('AC-4: rejects expired activation token (> 24 hours) and permits resending activation', async () => {
    const email = `buyer-${randomUUID()}@demo.invalid`;
    const password = 'StrongPassword123!';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const expiredToken = user.activationToken!;

    // Set activationExpires to 25 hours ago
    const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: { activationExpires: pastDate },
    });

    const activateRes = await request(app.getHttpServer())
      .post('/auth/activate')
      .send({ token: expiredToken })
      .expect(400);

    expect(activateRes.body.code).toBe('ACTIVATION_EXPIRED');

    // Resend activation token
    const resendRes = await request(app.getHttpServer())
      .post('/auth/resend-activation')
      .send({ email })
      .expect(200);

    expect(resendRes.body.status).toBe('ok');

    // Verify token was refreshed and is now in the future
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(updatedUser.activationToken).not.toBe(expiredToken);
    expect(updatedUser.activationExpires!.getTime()).toBeGreaterThan(Date.now());
  });

  it('Full Flow: activates account with valid token and allows buyer to login', async () => {
    const email = `buyer-${randomUUID()}@demo.invalid`;
    const password = 'StrongPassword123!';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const token = user.activationToken!;

    // Activate
    const activateRes = await request(app.getHttpServer())
      .post('/auth/activate')
      .send({ token })
      .expect(200);

    expect(activateRes.body.status).toBe('ok');

    // Login after activation
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

    // Access /auth/me to verify BUYER role
    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(meRes.body.email).toBe(email);
    expect(meRes.body.roles).toContain('BUYER');
  });
});
