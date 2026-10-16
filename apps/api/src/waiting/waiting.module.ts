import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module.js';
import { WaitingController } from './waiting.controller.js';
import { WaitingService } from './waiting.service.js';
import { WaitingAdmissionGuard } from './waiting.guard.js';

// Imports RedisModule directly (not only via the app's global scope) so any
// context that uses the waiting gate — API and the hold-expiry worker, which
// imports OrdersModule — can resolve REDIS_CLIENT on its own.
@Module({
  imports: [RedisModule],
  controllers: [WaitingController],
  providers: [WaitingService, WaitingAdmissionGuard],
  exports: [WaitingService, WaitingAdmissionGuard],
})
export class WaitingModule {}
