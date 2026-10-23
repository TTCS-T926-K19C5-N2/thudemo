import { Global, Module } from '@nestjs/common';
import { ShowtimesController } from './showtimes.controller.js';
import { ShowtimesService } from './showtimes.service.js';
import { SeatEventsService } from './seat-events.service.js';

@Global()
@Module({
  controllers: [ShowtimesController],
  providers: [ShowtimesService, SeatEventsService],
  exports: [ShowtimesService, SeatEventsService],
})
export class ShowtimesModule {}
