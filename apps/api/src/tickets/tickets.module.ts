import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TicketSigningService } from './ticket-signing.service.js';
import { TicketEmailService } from './ticket-email.service.js';
import { TicketReminderScheduler } from './ticket-reminder.scheduler.js';
import { OrderTicketsController, TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { TicketProjectionModule } from './ticket-projection.module.js';

@Module({
  imports: [PrismaModule, TicketProjectionModule],
  controllers: [TicketsController, OrderTicketsController],
  providers: [TicketSigningService, TicketsService, TicketEmailService, TicketReminderScheduler],
  exports: [TicketSigningService, TicketsService, TicketEmailService],
})
export class TicketsModule {}
