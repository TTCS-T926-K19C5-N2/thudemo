import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { hashSessionToken } from '../auth/auth.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { OrdersService } from './orders.service.js';

@Controller('showtimes/:id/orders')
@Roles('BUYER')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Post()
  @HttpCode(200)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createFromHold(
      id,
      req.user.id,
      hashSessionToken(req.sessionToken),
    );
  }
}

@Controller('orders')
@Roles('BUYER')
export class BuyerOrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get(':id')
  current(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.current(id, req.user.id);
  }
}
