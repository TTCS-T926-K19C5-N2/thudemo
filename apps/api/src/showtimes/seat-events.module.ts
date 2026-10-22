import { Module } from '@nestjs/common';
import { SeatEventsService } from './seat-events.service.js';

@Module({ providers: [SeatEventsService], exports: [SeatEventsService] })
export class SeatEventsModule {}
