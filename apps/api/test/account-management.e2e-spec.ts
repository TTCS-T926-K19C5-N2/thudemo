import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { AuthService } from '../src/auth/auth.service.js';

describe('S-28 account management with real stores', () => {
  let app: INestApplication;
  let second: INestApplication;
  let prisma: PrismaService;
  let admin: { id: string; cookie: string };
  let staff: { id: string; cookie: string };
  const ids: string[] = [];
  const password = 'FixturePassword123!';
  async function fixture(role: string) {
    const email = `mip005-${randomUUID()}@demo.invalid`;
    const user = await prisma.user.create({
      data: {
        email,
        password: await argon2.hash(password),
        isEmailVerified: true,
        userRoles: { create: { role: { connect: { name: role } } } },
      },
    });
    ids.push(user.id);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: user.id,
      email,
      cookie: login.headers['set-cookie'][0].split(';')[0] as string,
    };
  }
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (
      target.hostname !== '127.0.0.1' ||
      target.pathname !== '/sprint2_integration' ||
      !['15449', '15432'].includes(target.port)
    )
      throw Error('Requires isolated integration database');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.role.createMany({
      data: ['ADMIN', 'STAFF', 'ORGANIZER', 'BUYER', 'ACCOUNTANT'].map(
        (name) => ({ name }),
      ),
      skipDuplicates: true,
    });
    const other = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    second = other.createNestApplication();
    await second.init();
    admin = await fixture('ADMIN');
    staff = await fixture('STAFF');
  });
  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await second?.close();
    await app?.close();
  });
  it('rejects an old cookie on both API instances after disable and removes sessions', async () => {
    await request(second.getHttpServer())
      .get('/auth/me')
      .set('Cookie', staff.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/users/${staff.id}/disable`)
      .set('Cookie', admin.cookie)
      .send({})
      .expect(200);
    for (const server of [app, second]) {
      await request(server.getHttpServer())
        .get('/auth/me')
        .set('Cookie', staff.cookie)
        .expect(401);
    }
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(0);
  });
  it('returns 400 for missing, wrong-type and invalid staff input without writes', async () => {
    const before = await prisma.user.count();
    for (const body of [
      null,
      {},
      { email: 'bad', password: password },
      { email: 'staff@demo.invalid' },
      { email: 2, password: [] },
      { email: 'staff@demo.invalid', password: 'short' },
    ]) {
      await request(app.getHttpServer())
        .post('/users/staff')
        .set('Cookie', admin.cookie)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(body))
        .expect(400);
    }
    expect(await prisma.user.count()).toBe(before);
  });

  it('checks inactive database status even when a session row still exists', async () => {
    const user = await fixture('STAFF');
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    await request(second.getHttpServer())
      .get('/auth/me')
      .set('Cookie', user.cookie)
      .expect(401);
  });

  it('cannot issue a new session when disable commits during password verification', async () => {
    const user = await fixture('STAFF');
    const redis = app.get(RedisService);
    const original = redis.clearLoginFailures.bind(redis);
    redis.clearLoginFailures = async (email) => {
      await original(email);
      if (email === user.email)
        await request(second.getHttpServer())
          .patch(`/users/${user.id}/disable`)
          .set('Cookie', admin.cookie)
          .send({})
          .expect(200);
    };
    try {
      await expect(
        app.get(AuthService).login(user.email, password),
      ).rejects.toMatchObject({ status: 401 });
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        0,
      );
    } finally {
      redis.clearLoginFailures = original;
    }
  });

  it('serializes concurrent role changes and records a consistent before/after chain', async () => {
    const user = await fixture('STAFF');
    const results = await Promise.all(
      ['ORGANIZER', 'ACCOUNTANT'].map((role) =>
        request(app.getHttpServer())
          .patch(`/admin/users/${user.id}/role`)
          .set('Cookie', admin.cookie)
          .send({ role }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const roles = await prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    });
    expect(roles).toHaveLength(1);
    const logs = await prisma.userAdminAudit.findMany({
      where: { targetUserId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs).toHaveLength(2);
    const first = logs.find((log) => log.oldValue === 'STAFF');
    expect(first).toBeDefined();
    const last = logs.find((log) => log.oldValue === first?.newValue);
    expect(last).toBeDefined();
    expect(roles[0].role.name).toBe(last?.newValue);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it('rolls back role and session changes if the audit insert fails', async () => {
    const user = await fixture('STAFF');
    // Target is a generated fixture UUID; DDL is allowed only after the exact
    // isolated-database guard in beforeAll. Never install this in staging.
    if (!/^[0-9a-f-]{36}$/.test(user.id)) throw Error('Invalid fixture UUID');
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION mip005_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."targetUserId" = '${user.id}'::uuid THEN RAISE EXCEPTION 'MIP005 isolated audit fault'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER mip005_test_audit_failure BEFORE INSERT ON user_admin_audit FOR EACH ROW EXECUTE FUNCTION mip005_test_audit_failure()',
    );
    try {
      const { UsersService } = await import('../src/users/users.service.js');
      await expect(
        app.get(UsersService).changeRole(admin.id, user.id, 'ACCOUNTANT'),
      ).rejects.toThrow();
      const roles = await prisma.userRole.findMany({
        where: { userId: user.id },
        include: { role: true },
      });
      expect(roles.map((r) => r.role.name)).toEqual(['STAFF']);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        1,
      );
      expect(
        await prisma.userAdminAudit.count({ where: { targetUserId: user.id } }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER mip005_test_audit_failure ON user_admin_audit',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION mip005_test_audit_failure()',
      );
    }
  });
  it('does not allow an organizer to administer accounts', async () => {
    const organizer = await fixture('ORGANIZER');
    await request(app.getHttpServer())
      .post('/users/staff')
      .set('Cookie', organizer.cookie)
      .send({ email: `denied-${randomUUID()}@demo.invalid`, password })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${admin.id}/disable`)
      .set('Cookie', organizer.cookie)
      .send({})
      .expect(403);
  });
  it('creates a normalized employee and changes role atomically with an audit record', async () => {
    const email = `NEW-${randomUUID()}@DEMO.INVALID`;
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Cookie', admin.cookie)
      .send({ email: ` ${email} `, password, role: 'STAFF' })
      .expect(201);
    ids.push(created.body.id);
    expect(created.body.email).toBe(email.toLowerCase());
    expect(created.body.password).toBeUndefined();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0] as string;
    await request(app.getHttpServer())
      .patch(`/admin/users/${created.body.id}/role`)
      .set('Cookie', admin.cookie)
      .send({ role: 'ORGANIZER' })
      .expect(200);
    const current = await request(second.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(current.body.roles).toEqual(['ORGANIZER']);
    await request(second.getHttpServer())
      .get('/auth/organizer-only')
      .set('Cookie', cookie)
      .expect(200);
    await request(second.getHttpServer())
      .get('/check-in/today')
      .set('Cookie', cookie)
      .expect(403);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { userRoles: { include: { role: true } } },
    });
    expect(user.userRoles.map((r) => r.role.name)).toEqual(['ORGANIZER']);
    const logs = await prisma.$queryRaw<
      { action: string; oldValue: string; newValue: string }[]
    >`SELECT action,"oldValue","newValue" FROM user_admin_audit WHERE "targetUserId"=${user.id}::uuid ORDER BY "createdAt"`;
    expect(logs.map((l) => l.action)).toEqual([
      'CREATE_EMPLOYEE',
      'CHANGE_ROLE',
    ]);
    expect(logs[1]).toMatchObject({ oldValue: 'STAFF', newValue: 'ORGANIZER' });
    expect(JSON.stringify(logs)).not.toContain(email.toLowerCase());
  });
  it('denies self modification and malformed parameters without changing data', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/users/${admin.id}/role`)
      .set('Cookie', admin.cookie)
      .send({ role: 'STAFF' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${admin.id}/disable`)
      .set('Cookie', admin.cookie)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch('/users/not-a-uuid/disable')
      .set('Cookie', admin.cookie)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/admin/users/${staff.id}/role`)
      .set('Cookie', admin.cookie)
      .send({ role: 'TICKET_INSPECTOR' })
      .expect(400);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } }))
        .isActive,
    ).toBe(true);
  });
});
