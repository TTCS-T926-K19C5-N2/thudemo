import { Module } from '@nestjs/common';
import { HoldsService } from './holds.service.js';
import { HoldsController } from './holds.controller.js';
import { HoldExpiryScheduler } from './hold-expiry.scheduler.js';
@Module({
  controllers: [HoldsController],
  providers: [HoldsService, HoldExpiryScheduler],
  exports: [HoldsService],
})
export class HoldsModule {}
