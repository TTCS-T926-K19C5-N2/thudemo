import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SeatEventsService } from './seat-events.service.js';
@Global()
@Module({
  imports: [PrismaModule],
  providers: [SeatEventsService],
  exports: [SeatEventsService],
})
export class SeatEventsModule {}
