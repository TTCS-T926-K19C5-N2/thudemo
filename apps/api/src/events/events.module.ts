import { Module } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { EventsController } from './events.controller.js';
import { ShowtimesModule } from '../showtimes/showtimes.module.js';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
  imports: [ShowtimesModule],
})
export class EventsModule {}
