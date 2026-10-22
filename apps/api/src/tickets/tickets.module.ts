import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TicketSigningService } from './ticket-signing.service.js';
import { TicketEmailService } from './ticket-email.service.js';
import { TicketReminderScheduler } from './ticket-reminder.scheduler.js';
import {
  OrderTicketsController,
  TicketsController,
} from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { TicketProjectionModule } from './ticket-projection.module.js';
import { MailModule } from '../mail/mail.module.js';
import { TicketDeliveryService } from './ticket-delivery.service.js';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service.js';
import {
  TICKET_MAIL_TRANSPORT,
  ticketMailTransport,
} from './ticket-mail-transport.js';

@Module({
  imports: [PrismaModule, TicketProjectionModule, MailModule],
  controllers: [TicketsController, OrderTicketsController],
  providers: [
    TicketSigningService,
    TicketsService,
    TicketEmailService,
    TicketReminderScheduler,
    TicketDeliveryService,
    {
      provide: TICKET_MAIL_TRANSPORT,
      useFactory: ticketMailTransport,
      inject: [ConfigService, MailService],
    },
  ],
  exports: [TicketSigningService, TicketsService, TicketEmailService],
})
export class TicketsModule {}
