import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';
import { ServiceUnavailableException } from '@nestjs/common';

describe('AppController', () => {
  let appController: AppController;
  const prisma = { $queryRaw: vi.fn() };
  const redis = { ping: vi.fn() };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
        providers: [
          AppService,
          { provide: PrismaService, useValue: prisma },
          { provide: RedisService, useValue: redis },
        ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    beforeEach(() => {
      prisma.$queryRaw.mockReset().mockResolvedValue([{ value: 1 }]);
      redis.ping.mockReset().mockResolvedValue(undefined);
    });

    it('reports ready only after both dependencies respond', async () => {
      await expect(appController.getHealth()).resolves.toMatchObject({ status: 'ok' });
      expect(prisma.$queryRaw).toHaveBeenCalledOnce();
      expect(redis.ping).toHaveBeenCalledOnce();
    });

    it('does not report ready when a dependency fails', async () => {
      redis.ping.mockRejectedValueOnce(new Error('unavailable'));
      await expect(appController.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns unavailable when PostgreSQL does not respond', async () => {
      vi.useFakeTimers();
      try {
        prisma.$queryRaw.mockReturnValueOnce(new Promise(() => {}));
        const health = appController.getHealth();
        const result = expect(health).rejects.toBeInstanceOf(ServiceUnavailableException);
        await vi.advanceTimersByTimeAsync(1500);
        await result;
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
