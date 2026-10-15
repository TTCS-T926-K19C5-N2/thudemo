import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { HoldsService } from './holds.service.js';
import { metrics } from '../monitoring/metrics.js';

@Injectable()
export class HoldExpiryScheduler
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<number>;
  private isSweeping = false;
  private bootstrapped = false;
  private readonly logger = new Logger(HoldExpiryScheduler.name);
  constructor(private readonly service: HoldsService) {}
  onModuleInit() {
    const mode = process.env.HOLD_EXPIRY_MODE ?? 'off';
    if (!['off', 'api', 'worker'].includes(mode))
      throw new Error('HOLD_EXPIRY_MODE must be off, api or worker');
    if (mode === 'off') return;
    void this.tick(); // Restart drains expired backlog without waiting for the first minute.
    const interval = process.env.HOLD_EXPIRY_INTERVAL_MS
      ? Number(process.env.HOLD_EXPIRY_INTERVAL_MS)
      : (mode === 'api' ? 2000 : 60000);
    this.timer = setInterval(() => void this.tick(), interval);
  }
  async onApplicationBootstrap() {
    const mode = process.env.HOLD_EXPIRY_MODE ?? 'off';
    if (mode === 'off') return;
    if (this.running) {
      await this.running;
      return;
    }
    if (this.bootstrapped) {
      return;
    }
    await this.cleanupExpiredHolds();
  }
  async cleanupExpiredHolds(): Promise<number> {
    if (this.running) {
      return this.running;
    }
    return this.tick();
  }
  async sweepExpired(): Promise<number> {
    return this.cleanupExpiredHolds();
  }
  private tick(): Promise<number> {
    if (this.running) return this.running;
    this.bootstrapped = true;
    this.isSweeping = true;
    const started = process.hrtime.bigint();
    const sweepFn =
      this.service.cleanupExpiredHolds?.bind(this.service) ??
      this.service.sweep.bind(this.service);
    this.running = Promise.resolve(sweepFn())
      .then((deleted) => {
        if (deleted > 0) {
          metrics.safe(() => {
            metrics.cleaned.inc(deleted);
            metrics.workerLastSuccess.set(Date.now() / 1000);
          });
        }
        return deleted;
      })
      .catch(() => {
        metrics.safe(() => metrics.workerErrors.inc());
        this.logger.error(
          JSON.stringify({
            event: 'hold_expiry_failed',
            retryOnNextMinute: true,
          }),
        );
        return 0;
      })
      .finally(() => {
        metrics.safe(() =>
          metrics.workerDuration.observe(
            Number(process.hrtime.bigint() - started) / 1e9,
          ),
        );
        this.isSweeping = false;
        this.running = undefined;
      });
    return this.running;
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.running) await this.running;
  }
}
