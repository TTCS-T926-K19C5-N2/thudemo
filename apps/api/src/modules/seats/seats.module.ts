import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SeatHoldService } from './seat-hold.service.js';
import { SeatHoldController } from './seat-hold.controller.js';
import { SeatHoldCountdownService } from './services/seat-hold-countdown.service.js';
import { SEAT_VALIDATOR } from './interfaces/seat-validator.interface.js';
import { MockSeatValidatorAdapter } from './adapters/mock-seat-validator.adapter.js';
import { SeatExpiryJobService } from './jobs/seat-expiry-job.service.js';
import { SeatAvailabilityQueryService } from './queries/seat-availability.query.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  controllers: [SeatHoldController],
  providers: [
    SeatHoldService,
    SeatHoldCountdownService,
    SeatExpiryJobService,
    SeatAvailabilityQueryService,
    {
      provide: SEAT_VALIDATOR,
      useClass: MockSeatValidatorAdapter,
    },
  ],
  exports: [
    SeatHoldService,
    SeatHoldCountdownService,
    SeatExpiryJobService,
    SeatAvailabilityQueryService,
    SEAT_VALIDATOR,
  ],
})
export class SeatsModule {}
