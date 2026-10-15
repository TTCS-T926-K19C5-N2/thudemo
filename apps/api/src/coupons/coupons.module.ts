import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CouponsService } from './coupons.service.js';
import {
  EventCouponsController,
  OrderCouponsController,
} from './coupons.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [EventCouponsController, OrderCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
