import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { TicketQrService } from './ticket-qr.service.js';
@Controller('orders')
@Roles('BUYER')
export class TicketQrController {
  constructor(private readonly service: TicketQrService) {}
  @Get(':id/tickets')
  @Header('Cache-Control', 'no-store')
  tickets(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.forOwner(id, req.user.id);
  }
}
