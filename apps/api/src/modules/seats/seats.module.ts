import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SeatHoldService } from './seat-hold.service.js';
import { SeatHoldStorage } from './seat-hold.storage.js';
import { SeatHoldController } from './seat-hold.controller.js';
import { SEAT_VALIDATOR } from './interfaces/seat-validator.interface.js';
import { SeatValidatorAdapter } from './adapters/seat-validator.adapter.js';
import { SeatExpiryJobService } from './jobs/seat-expiry-job.service.js';
import { SeatAvailabilityQueryService } from './queries/seat-availability.query.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  controllers: [SeatHoldController],
  providers: [
    SeatHoldService,
    SeatHoldStorage,
    SeatExpiryJobService,
    SeatAvailabilityQueryService,
    {
      provide: SEAT_VALIDATOR,
      useClass: SeatValidatorAdapter,
    },
  ],
  exports: [
    SeatHoldService,
    SeatHoldStorage,
    SeatExpiryJobService,
    SeatAvailabilityQueryService,
    SEAT_VALIDATOR,
  ],
})
export class SeatsModule {}
