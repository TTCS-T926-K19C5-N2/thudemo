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
import { hashSessionToken } from '../auth/auth.service.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { OrdersService } from './orders.service.js';

@Controller()
@Roles('BUYER')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Post('showtimes/:id/orders')
  @HttpCode(200)
  create(
    @Param('id', ParseUUIDPipe) showtimeId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.create(
      showtimeId,
      req.user.id,
      hashSessionToken(req.sessionToken),
      body,
    );
  }

  @Get('orders/:id')
  detail(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.detail(orderId, req.user.id);
  }
}

