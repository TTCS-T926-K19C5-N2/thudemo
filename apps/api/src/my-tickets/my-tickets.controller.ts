import { Controller, Get, Header, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { MyTicketsService } from './my-tickets.service.js';

@Controller('tickets')
@Roles('BUYER')
export class MyTicketsController {
  constructor(private readonly service: MyTicketsService) {}

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  mine(@Req() req: AuthenticatedRequest) {
    return this.service.mineForOwner(req.user.id);
  }
}
