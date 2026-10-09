import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TicketSigningService } from './ticket-signing.service.js';
import { OrderTicketsController, TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [TicketsController, OrderTicketsController],
  providers: [TicketSigningService, TicketsService],
  exports: [TicketSigningService, TicketsService],
})
export class TicketsModule {}
