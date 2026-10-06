import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { holdStatementNames } from './hold-statement-names.js';
import { holdTransaction, type HoldQueryable } from './hold-transaction.js';
import { prepareHoldPool } from './prepare-hold-pool.js';

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
  private readonly readyConnections: number;

  constructor(configService: ConfigService) {
    // Two local API instances use at most 32 connections, leaving room for worker/migrations.
    const names = holdStatementNames();
    const readyConnections =
      configService.get<string>('HOLD_EXPIRY_MODE') === 'worker' ? 1 : 16;
    const adapter = new HoldPoolAdapter(
      {
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        max: 16,
        min: readyConnections,
        connectionTimeoutMillis: 10000,
      },
      { statementNameGenerator: names },
    );
    super({
      adapter,
    });
    this.holdAdapter = adapter;
    this.holdNames = names;
    this.readyConnections = readyConnections;
  }

  async holdTransaction<T>(callback: (tx: HoldQueryable) => Promise<T>) {
    await this.$connect();
    const pool = this.holdAdapter.pool;
    if (!pool) throw Error('Hold connection pool is unavailable');
    return holdTransaction(pool, callback, this.holdNames);
  }

  async sessionQuery<T>(sql: Prisma.Sql): Promise<T> {
    return this.seatReadQuery<T>(sql);
  }

  async commitHoldRoutine<T>(sql: Prisma.Sql): Promise<T> {
    await this.$connect();
    const pool = this.holdAdapter.pool;
    if (!pool) throw Error('Hold connection pool is unavailable');
    return holdTransaction(pool, (tx) => tx.$queryRaw<T>(sql), this.holdNames, {
      maxWait: 10000,
      timeout: 10000,
      validatedRoutine: true,
    });
  }

  // Scoped to session/seat reads with primitive bindings and known projections;
  // not a replacement for Prisma model operations or order transactions.
  async seatReadQuery<T>(sql: Prisma.Sql): Promise<T> {
    if (
      sql.values.some(
        (v) =>
          v !== null && !['string', 'number', 'boolean'].includes(typeof v),
      )
    )
      throw Error('Unsupported seat read parameter type');
    await this.$connect();
    const pool = this.holdAdapter.pool;
    if (!pool) throw Error('Seat read connection pool is unavailable');
    // Never cache session/role, seat price or inventory results.
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
    const pool = this.holdAdapter.pool;
    if (!pool) throw Error('Hold connection pool is unavailable');
    await prepareHoldPool(pool, this.readyConnections);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
