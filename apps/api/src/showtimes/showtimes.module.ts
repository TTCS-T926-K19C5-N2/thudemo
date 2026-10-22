import { Module } from '@nestjs/common';
import { ShowtimesController } from './showtimes.controller.js';
import { ShowtimesService } from './showtimes.service.js';
import { SeatEventsModule } from './seat-events.module.js';
@Module({ imports: [SeatEventsModule], controllers: [ShowtimesController], providers: [ShowtimesService] })
export class ShowtimesModule {}
