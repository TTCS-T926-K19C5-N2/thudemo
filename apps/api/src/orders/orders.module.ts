import { Module } from '@nestjs/common';
import {
  OrdersController,
  ShowtimeOrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { OrderExpiryScheduler } from './order-expiry.scheduler.js';
import { TicketCheckInController } from './ticket-check-in.controller.js';
import { TicketCheckInService } from './ticket-check-in.service.js';

@Module({
  controllers: [
    OrdersController,
    ShowtimeOrdersController,
    TicketCheckInController,
  ],
  providers: [OrdersService, OrderExpiryScheduler, TicketCheckInService],
  exports: [OrdersService, OrderExpiryScheduler],
})
export class OrdersModule {}
