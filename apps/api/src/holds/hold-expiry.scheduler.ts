import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { HoldsService } from './holds.service.js';

@Injectable()
export class HoldExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(HoldExpiryScheduler.name);
  constructor(private readonly service: HoldsService) {}
  onModuleInit() {
    const mode = process.env.HOLD_EXPIRY_MODE ?? 'off';
    if (!['off', 'api', 'worker'].includes(mode))
      throw new Error('HOLD_EXPIRY_MODE must be off, api or worker');
    if (mode === 'off') return;
    this.tick(); // Restart drains expired backlog without waiting for the first minute.
    this.timer = setInterval(() => this.tick(), 60000);
  }
  private tick() {
    if (this.running) return;
    this.running = this.service
      .sweep()
      .then(() => undefined)
      .catch(() => {
        this.logger.error(
          JSON.stringify({
            event: 'hold_expiry_failed',
            retryOnNextMinute: true,
          }),
        );
      })
      .finally(() => {
        this.running = undefined;
      });
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
