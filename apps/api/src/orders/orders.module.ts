import { ScannerModule } from '../scanner/scanner.module.js';
import { TicketQrController } from './ticket-qr.controller.js';
import { TicketQrService } from './ticket-qr.service.js';
import { Module } from '@nestjs/common';
import {
  OrdersController,
  ShowtimeOrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { OrderHistoryService } from './order-history.service.js';
import { OrderExpiryScheduler } from './order-expiry.scheduler.js';
import { TicketCheckInController } from './ticket-check-in.controller.js';
import { TicketCheckInService } from './ticket-check-in.service.js';
import { WaitingModule } from '../waiting/waiting.module.js';

@Module({
  imports: [ScannerModule, WaitingModule],
  controllers: [
    TicketQrController,
    OrdersController,
    ShowtimeOrdersController,
    TicketCheckInController,
  ],
  providers: [
    TicketQrService,
    OrdersService,
    OrderHistoryService,
    OrderExpiryScheduler,
    TicketCheckInService,
  ],
  exports: [OrdersService, OrderExpiryScheduler],
})
export class OrdersModule {}
