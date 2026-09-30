import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Organizer events (e2e)', () => {
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

  afterAll(async () => app.close());

  async function createOrganizer() {
    const email = `${randomUUID()}@demo.invalid`;
    const password = randomUUID();
    const role = await prisma.role.upsert({
      where: { name: 'ORGANIZER' },
      update: {},
      create: { name: 'ORGANIZER' },
    });
    const user = await prisma.user.create({
      data: {
        email,
        password: await argon2.hash(password, { type: argon2.argon2id }),
        isEmailVerified: true,
        userRoles: { create: { role: { connect: { id: role.id } } } },
      },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      user,
      cookie: login.headers['set-cookie'][0].split(';')[0] as string,
    };
  }

  it('creates, edits and isolates events, then warns on a duplicate showtime', async () => {
    const owner = await createOrganizer();
    const other = await createOrganizer();
    const eventInput = {
      name: 'Đêm nhạc thử nghiệm',
      description: 'Dữ liệu giả',
      location: 'Phòng A',
    };

    try {
      const invalid = await request(app.getHttpServer())
        .post('/events')
        .set('Cookie', owner.cookie)
        .send({ name: '', description: '', location: '' })
        .expect(400);
      expect(invalid.body.errors).toHaveProperty('name');

      const created = await request(app.getHttpServer())
        .post('/events')
        .set('Cookie', owner.cookie)
        .send(eventInput)
        .expect(201);
      const id = created.body.id as string;
      expect(created.body.status).toBe('DRAFT');

      const mine = await request(app.getHttpServer())
        .get('/events/mine')
        .set('Cookie', owner.cookie)
        .expect(200);
      expect(mine.body.some((event: { id: string }) => event.id === id)).toBe(
        true,
      );
      const others = await request(app.getHttpServer())
        .get('/events/mine')
        .set('Cookie', other.cookie)
        .expect(200);
      expect(others.body.some((event: { id: string }) => event.id === id)).toBe(
        false,
      );

      await request(app.getHttpServer())
        .get(`/events/${id}/manage`)
        .set('Cookie', other.cookie)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/events/${id}`)
        .set('Cookie', other.cookie)
        .send(eventInput)
        .expect(403);
      await request(app.getHttpServer()).get(`/events/${id}`).expect(404);

      await request(app.getHttpServer())
        .patch(`/events/${id}`)
        .set('Cookie', owner.cookie)
        .send({ ...eventInput, name: 'Đêm nhạc đã sửa' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/events/${id}/showtimes`)
        .set('Cookie', owner.cookie)
        .send({ startTime: new Date(Date.now() - 60_000).toISOString() })
        .expect(400);
      const startTime = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();
      const first = await request(app.getHttpServer())
        .post(`/events/${id}/showtimes`)
        .set('Cookie', owner.cookie)
        .send({ startTime })
        .expect(201);
      expect(first.body.warning).toBeNull();
      const second = await request(app.getHttpServer())
        .post(`/events/${id}/showtimes`)
        .set('Cookie', owner.cookie)
        .send({ startTime })
        .expect(201);
      expect(second.body.warning).toContain('cùng giờ');
    } finally {
      const events = await prisma.event.findMany({
        where: { organizerId: owner.user.id },
        select: { id: true },
      });
      await prisma.showtime.deleteMany({
        where: { eventId: { in: events.map((event) => event.id) } },
      });
      await prisma.event.deleteMany({ where: { organizerId: owner.user.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner.user.id, other.user.id] } },
      });
    }
  }, 15_000);
});
