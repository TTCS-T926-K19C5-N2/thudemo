import { Module } from '@nestjs/common';
import { HoldsService } from './holds.service.js';
import { HoldsController } from './holds.controller.js';
import { HoldExpiryScheduler } from './hold-expiry.scheduler.js';
import { SeatEventsModule } from '../showtimes/seat-events.module.js';
@Module({
  imports: [SeatEventsModule],
  controllers: [HoldsController],
  providers: [HoldsService, HoldExpiryScheduler],
  exports: [HoldsService],
})
export class HoldsModule {}
