import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { holdStatementNames } from './hold-statement-names.js';
import { holdTransaction, type HoldQueryable } from './hold-transaction.js';

class HoldPoolAdapter extends PrismaPg {
  pool?: ReturnType<
    Awaited<ReturnType<PrismaPg['connect']>>['underlyingDriver']
  >;

  override async connect() {
    const adapter = await super.connect();
    this.pool = adapter.underlyingDriver();
    return adapter;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly holdAdapter: HoldPoolAdapter;
  private readonly holdNames: ReturnType<typeof holdStatementNames>;

  constructor(configService: ConfigService) {
    // Two local API instances use at most 32 connections, leaving room for worker/migrations.
    const names = holdStatementNames();
    const adapter = new HoldPoolAdapter(
      {
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        max: 16,
      },
      { statementNameGenerator: names },
    );
    super({
      adapter,
    });
    this.holdAdapter = adapter;
    this.holdNames = names;
  }

  async holdTransaction<T>(callback: (tx: HoldQueryable) => Promise<T>) {
    await this.$connect();
    const pool = this.holdAdapter.pool;
    if (!pool) throw Error('Hold connection pool is unavailable');
    return holdTransaction(pool, callback, this.holdNames);
  }

  async sessionQuery<T>(sql: Prisma.Sql): Promise<T> {
    await this.$connect();
    const pool = this.holdAdapter.pool;
    if (!pool) throw Error('Session connection pool is unavailable');
    // Only the existing session guard read; never cache a session/user/role result.
    // Pool.query owns and releases its client, including query errors.
    const result = await pool.query({
      text: sql.text,
      values: sql.values,
      name: this.holdNames({ sql: sql.text }),
    });
    return result.rows as T;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
