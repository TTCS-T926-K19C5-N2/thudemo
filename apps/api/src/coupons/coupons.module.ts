import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import {
  EventCouponsController,
  OrderCouponController,
} from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';

@Module({
  imports: [PrismaModule, TicketsModule],
  controllers: [EventCouponsController, OrderCouponController],
  providers: [CouponsService],
})
export class CouponsModule {}
