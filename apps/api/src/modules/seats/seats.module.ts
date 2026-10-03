import { Module } from '@nestjs/common';
import { SeatHoldService } from './seat-hold.service.js';
import { SeatHoldController } from './seat-hold.controller.js';
import { SEAT_VALIDATOR } from './interfaces/seat-validator.interface.js';
import { MockSeatValidatorAdapter } from './adapters/mock-seat-validator.adapter.js';

@Module({
  controllers: [SeatHoldController],
  providers: [
    SeatHoldService,
    {
      provide: SEAT_VALIDATOR,
      useClass: MockSeatValidatorAdapter,
    },
  ],
  exports: [SeatHoldService, SEAT_VALIDATOR],
})
export class SeatsModule {}
