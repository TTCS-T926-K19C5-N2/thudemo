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
  private running?: Promise<void>;
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
    await this.cleanupExpiredHolds();
  }
  async cleanupExpiredHolds(): Promise<number> {
    await this.running;
    const sweepFn =
      this.service.cleanupExpiredHolds?.bind(this.service) ??
      this.service.sweep.bind(this.service);
    const deleted = await sweepFn();
    if (deleted > 0) {
      metrics.safe(() => {
        metrics.cleaned.inc(deleted);
        metrics.workerLastSuccess.set(Date.now() / 1000);
      });
    }
    return deleted;
  }
  async sweepExpired(): Promise<number> {
    return this.cleanupExpiredHolds();
  }
  private tick(): Promise<void> {
    if (this.running) return this.running;
    const started = process.hrtime.bigint();
    this.running = this.service
      .sweep()
      .then((deleted) => {
        metrics.safe(() => {
          metrics.cleaned.inc(deleted);
          metrics.workerLastSuccess.set(Date.now() / 1000);
        });
      })
      .catch(() => {
        metrics.safe(() => metrics.workerErrors.inc());
        this.logger.error(
          JSON.stringify({
            event: 'hold_expiry_failed',
            retryOnNextMinute: true,
          }),
        );
      })
      .finally(() => {
        metrics.safe(() =>
          metrics.workerDuration.observe(
            Number(process.hrtime.bigint() - started) / 1e9,
          ),
        );
        this.running = undefined;
      });
    return this.running;
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
