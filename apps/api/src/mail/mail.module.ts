import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { MailService } from './mail.service.js';
import { TicketEmailService } from './ticket-email.service.js';
import { TicketEmailScheduler } from './ticket-email.scheduler.js';
import { TicketResendController } from './mail.controller.js';

@Module({
  imports: [PrismaModule, TicketsModule],
  controllers: [TicketResendController],
  providers: [MailService, TicketEmailService, TicketEmailScheduler],
  exports: [MailService, TicketEmailService],
})
export class MailModule {}
