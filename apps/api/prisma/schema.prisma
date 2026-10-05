import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

const DEFAULT_POOL_MAX = 16;
const MAX_POOL_MAX = 40;

function poolMax(configService: ConfigService): number {
  const configured = configService.get<string>('DATABASE_POOL_MAX');
  const value = configured === undefined ? DEFAULT_POOL_MAX : Number(configured);
  if (!Number.isInteger(value) || value < 1 || value > MAX_POOL_MAX) {
    throw new Error(
      `DATABASE_POOL_MAX must be an integer from 1 to ${MAX_POOL_MAX}`,
    );
  }
  return value;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly warmPool: boolean;
  private readonly poolSize: number;

  constructor(configService: ConfigService) {
    const max = poolMax(configService);
    super({
      adapter: new PrismaPg({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        max,
      }),
    });
    this.poolSize = max;
    this.warmPool =
      configService.get<string>('DATABASE_POOL_WARMUP') === 'true';
  }

  async onModuleInit() {
    await this.$connect();
    // node-postgres creates clients lazily. The opt-in load/staging profile
    // establishes its bounded capacity before readiness instead of charging
    // connection setup to the first customer burst.
    if (this.warmPool) {
      await Promise.all(
        Array.from({ length: this.poolSize }, () => this.$queryRaw`SELECT 1`),
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
