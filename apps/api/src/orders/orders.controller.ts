import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { hashSessionToken } from '../auth/auth.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { OrdersService } from './orders.service.js';
import { OrderHistoryService } from './order-history.service.js';
import { orderPagination } from './order-pagination.js';

@Controller('showtimes/:id/orders')
@Roles('BUYER')
export class ShowtimeOrdersController {
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
export class OrdersController {
  constructor(
    private readonly service: OrdersService,
    private readonly history: OrderHistoryService,
  ) {}

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

  @Get('me')
  @Roles('BUYER')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: unknown,
    @Query('pageSize') pageSize?: unknown,
  ) {
    return this.history.list(req.user.id, orderPagination({ page, pageSize }));
  }

  @Get(':id')
  @Roles('BUYER')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  getOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.getOrderById(id, req.user.id);
  }

  @Get(':id/status')
  @Roles('BUYER')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  getOrderStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.getOrderStatus(id, req.user.id);
  }
}
