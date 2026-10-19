import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { SeatHoldController } from '../src/modules/seats/seat-hold.controller.js';
import { SeatHoldService } from '../src/modules/seats/seat-hold.service.js';
import { SeatAvailabilityQueryService } from '../src/modules/seats/queries/seat-availability.query.js';
import { SEAT_VALIDATOR } from '../src/modules/seats/interfaces/seat-validator.interface.js';
import { MockSeatValidatorAdapter } from '../src/modules/seats/adapters/mock-seat-validator.adapter.js';

describe('K-01 isolated research HTTP fixture (not the production AppModule)', () => {
  let app: INestApplication;
  let redis: Redis;
  const showtimeId = 'st_101';
  const seatA1Key = `hold:showtime:${showtimeId}:seat:A1`;
  const seatA2Key = `hold:showtime:${showtimeId}:seat:A2`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      // Prototype behavior is deliberately reachable only in this isolated fixture.
      // No production Redis, scheduler, auth or PostgreSQL is touched.
      controllers: [SeatHoldController],
      providers: [
        SeatHoldService,
        SeatAvailabilityQueryService,
        { provide: SEAT_VALIDATOR, useClass: MockSeatValidatorAdapter },
        { provide: 'REDIS_CLIENT', useValue: prototypeRedis() },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    redis = app.get<Redis>('REDIS_CLIENT');
    // Dọn dẹp key test trước khi chạy
    await redis.del(seatA1Key, seatA2Key);
  });

  afterAll(async () => {
    // Dọn dẹp key sau khi test xong
    if (redis) {
      await redis.del(seatA1Key, seatA2Key);
    }
    await app.close();
  });

  it('Test case 1: Giữ 2 ghế A1, A2 thành công (HTTP 201 Created)', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/showtimes/${showtimeId}/hold-seats`)
      .send({ seatIds: ['A1', 'A2'] })
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      showtimeId,
      heldSeats: ['A1', 'A2'],
      expiresInSeconds: 600,
    });

    expect(response.body.expiresAt).toBeDefined();
    const expiryTime = new Date(response.body.expiresAt).getTime();
    expect(expiryTime).toBeGreaterThan(Date.now());

    // Xác nhận key đã được lưu vào Redis và có TTL hợp lệ
    const a1Holder = await redis.get(seatA1Key);
    const a2Holder = await redis.get(seatA2Key);
    const ttlA1 = await redis.ttl(seatA1Key);

    expect(a1Holder).toBeDefined();
    expect(a2Holder).toBeDefined();
    expect(ttlA1).toBeGreaterThan(0);
    expect(ttlA1).toBeLessThanOrEqual(600);
  });

  it('Test case 2: Giữ lại ghế A1 bị từ chối 409 Conflict', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/showtimes/${showtimeId}/hold-seats`)
      .send({ seatIds: ['A1'] })
      .expect(409);

    expect(response.body.message).toContain('Ghế A1 đã bị người khác chọn');
  });
});

function prototypeRedis() {
  const values = new Map<string, { value: string; until: number }>();
  const get = async (key: string) => {
    const entry = values.get(key);
    if (!entry || entry.until <= Date.now()) {
      values.delete(key);
      return null;
    }
    return entry.value;
  };
  return {
    get,
    async set(
      key: string,
      value: string,
      _ex: string,
      seconds: number,
      _nx: string,
    ) {
      if (await get(key)) return null;
      values.set(key, { value, until: Date.now() + seconds * 1000 });
      return 'OK';
    },
    async del(...keys: string[]) {
      return keys.filter((key) => values.delete(key)).length;
    },
    async ttl(key: string) {
      return (await get(key))
        ? Math.ceil((values.get(key)!.until - Date.now()) / 1000)
        : -2;
    },
    async exists(key: string) {
      return (await get(key)) ? 1 : 0;
    },
  };
}
