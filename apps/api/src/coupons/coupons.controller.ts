import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { CouponsService } from './coupons.service.js';

@Controller('events/:eventId/coupons')
@Roles('ORGANIZER')
export class EventCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coupons.listForOwner(eventId, request.user.id);
  }

  @Post()
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coupons.createForOwner(eventId, request.user.id, body);
  }

  @Patch(':couponId')
  update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('couponId', ParseUUIDPipe) couponId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coupons.updateForOwner(eventId, couponId, request.user.id, body);
  }

  @Delete(':couponId')
  @HttpCode(200)
  deactivate(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('couponId', ParseUUIDPipe) couponId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coupons.deactivateForOwner(eventId, couponId, request.user.id);
  }
}

@Controller('orders/:orderId/coupon')
@Roles('BUYER')
export class OrderCouponController {
  constructor(private readonly coupons: CouponsService) {}

  @Post()
  @HttpCode(200)
  apply(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coupons.applyToOrder(orderId, request.user.id, body);
  }

  @Delete()
  @HttpCode(200)
  remove(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coupons.removeFromOrder(orderId, request.user.id);
  }
}
