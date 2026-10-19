import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators/roles.decorator.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async getHealth() {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Health check timeout')), 1500);
        }),
      ]);
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
