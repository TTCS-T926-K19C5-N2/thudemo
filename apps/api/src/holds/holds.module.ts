import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { HoldsController } from './holds.controller.js';
import { HoldsService } from './holds.service.js';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 1000,
      },
    ]),
  ],
  controllers: [HoldsController],
  providers: [
    HoldsService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class HoldsModule {}