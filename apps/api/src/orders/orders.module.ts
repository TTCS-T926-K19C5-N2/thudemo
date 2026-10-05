import { Module } from '@nestjs/common';
import {
  BuyerOrdersController,
  OrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController, BuyerOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
