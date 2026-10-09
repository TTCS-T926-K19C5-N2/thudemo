import { Controller, Get, Header, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { TicketSigningService } from './ticket-signing.service.js';
import { TicketsService } from './tickets.service.js';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly signing: TicketSigningService) {}

  // Public keys only. Scanners download them ahead of time to verify QR
  // signatures offline.
  @Public()
  @Get('public-keys')
  getPublicKeys() {
    return { keys: this.signing.getPublicKeys() };
  }
}

@Controller('orders/:id/tickets')
export class OrderTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  // Owner only; an order that is not PAID has no tickets yet.
  @Get()
  @Roles('BUYER')
  @Header('Cache-Control', 'no-store')
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return { tickets: await this.tickets.listForOrder(id, req.user.id) };
  }
}
