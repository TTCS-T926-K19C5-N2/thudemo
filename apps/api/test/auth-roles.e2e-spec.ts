import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Role assignments (e2e)', () => {
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

  it('uses current database roles and denies an undeclared route', async () => {
    const email = `organizer-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    await prisma.role.createMany({
      data: [{ name: 'ORGANIZER' }],
      skipDuplicates: true,
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'ORGANIZER' },
    });
    const user = await prisma.user.create({
      data: {
        email,
        password: await argon2.hash(password, { type: argon2.argon2id }),
        isEmailVerified: true,
        userRoles: { create: { role: { connect: { id: role.id } } } },
      },
    });

    try {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      const cookie = login.headers['set-cookie'][0].split(';')[0] as string;

      await request(app.getHttpServer())
        .get('/auth/organizer-only')
        .set('Cookie', cookie)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', 'https://other.example')
        .expect(403);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3000')
        .set('Sec-Fetch-Site', 'same-origin')
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/organizer-only')
        .set('Cookie', cookie)
        .expect(401);

      const secondLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      const secondCookie = secondLogin.headers['set-cookie'][0].split(
        ';',
      )[0] as string;

      await prisma.userRole.delete({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
      });

      await request(app.getHttpServer())
        .get('/auth/organizer-only')
        .set('Cookie', secondCookie)
        .expect(403);

      await request(app.getHttpServer())
        .get('/')
        .set('Cookie', secondCookie)
        .expect(403);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('keeps the lock in Redis when the application is recreated', async () => {
    const email = `locked-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    const user = await prisma.user.create({
      data: {
        email,
        password: await argon2.hash(password, { type: argon2.argon2id }),
        isEmailVerified: true,
      },
    });

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'incorrect' })
          .expect(401);
      }

      const freshModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const restartedApp = freshModule.createNestApplication();
      await restartedApp.init();
      try {
        const locked = await request(restartedApp.getHttpServer())
          .post('/auth/login')
          .send({ email, password })
          .expect(429);
        expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
      } finally {
        await restartedApp.close();
      }
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('rejects an expired server-side session', async () => {
    const email = `session-${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    await prisma.role.createMany({
      data: [{ name: 'BUYER' }],
      skipDuplicates: true,
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'BUYER' },
    });
    const user = await prisma.user.create({
      data: {
        email,
        password: await argon2.hash(password, { type: argon2.argon2id }),
        isEmailVerified: true,
        userRoles: { create: { role: { connect: { id: role.id } } } },
      },
    });

    try {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      const cookie = login.headers['set-cookie'][0].split(';')[0] as string;
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie)
        .expect(401);

      const secondLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      const activeCookie = secondLogin.headers['set-cookie'][0].split(
        ';',
      )[0] as string;
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        1,
      );
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', activeCookie)
        .expect(200);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
