import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { TicketEmailService } from './ticket-email.service.js';

@Controller('orders/:id/tickets/resend')
export class TicketResendController {
  constructor(private readonly ticketEmail: TicketEmailService) {}

  // Resends the tickets already issued for this order to the account email.
  // It never creates tickets: the same stored QR payloads are sent again.
  // Owner only (404 for other users' orders); PAID orders only.
  @Post()
  @HttpCode(200)
  @Roles('BUYER')
  resend(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ticketEmail.sendTicketsForOrder(id, req.user.id);
  }
}
