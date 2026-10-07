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

@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Post()
  @Roles('BUYER')
  @HttpCode(201)
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.createOrder(
      req.user.id,
      hashSessionToken(req.sessionToken),
      body,
    );
  }

  @Get(':id')
  @Roles('BUYER')
  getOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.getOrderById(id, req.user.id);
  }
}
