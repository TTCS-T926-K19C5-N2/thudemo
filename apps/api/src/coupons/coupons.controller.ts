import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { CouponsService } from './coupons.service.js';
import type { ApplyCouponDto, CreateCouponDto } from './coupons.dto.js';

@Controller('events/:eventId/coupons')
export class EventCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  /**
   * S-56: Ban tổ chức tạo mã giảm giá cho sự kiện
   */
  @Post()
  @Roles('ORGANIZER', 'ADMIN')
  @HttpCode(201)
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: CreateCouponDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.couponsService.createCoupon(
      req.user.id,
      req.user.roles,
      eventId,
      body,
    );
  }

  /**
   * S-56: Ban tổ chức xem danh sách mã giảm giá của sự kiện
   */
  @Get()
  @Roles('ORGANIZER', 'ADMIN')
  findAll(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.couponsService.getEventCoupons(
      req.user.id,
      req.user.roles,
      eventId,
    );
  }
}

@Controller('orders/:orderId/coupon')
export class OrderCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  /**
   * S-56: Người mua nhập mã giảm giá ở trang đơn hàng
   */
  @Post()
  @Roles('BUYER')
  @HttpCode(200)
  apply(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: ApplyCouponDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.couponsService.applyCouponToOrder(
      req.user.id,
      orderId,
      body,
    );
  }

  /**
   * S-56: Người mua gỡ mã giảm giá khỏi đơn hàng
   */
  @Delete()
  @Roles('BUYER')
  @HttpCode(200)
  remove(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.couponsService.removeCouponFromOrder(
      req.user.id,
      orderId,
    );
  }
}
