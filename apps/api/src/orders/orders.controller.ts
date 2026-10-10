import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { OrdersService } from './orders.service.js';

type CheckoutDto = {
  showtimeId: string;
  seatIds: string[];
};

@Controller('orders')
@Roles('BUYER')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @HttpCode(200)
  checkout(
    @Req() req: AuthenticatedRequest,
    @Body() body: CheckoutDto,
  ) {
    return this.ordersService.checkout(
      body.showtimeId,
      req.user.id,
      req.user.email,
      body.seatIds,
    );
  }

  @Post(':id/resend')
  @HttpCode(200)
  resend(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ordersService.resendEmail(req.user.id, id);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getUserOrders(req.user.id);
  }

  @Get(':id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ordersService.getOrderDetails(id, req.user.id);
  }
}
