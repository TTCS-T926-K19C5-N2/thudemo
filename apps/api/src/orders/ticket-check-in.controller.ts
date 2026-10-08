import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { TicketCheckInService } from './ticket-check-in.service.js';

@Controller('showtimes')
export class TicketCheckInController {
  constructor(private readonly service: TicketCheckInService) {}

  @Post(':showtimeId/check-in')
  @Roles('STAFF', 'ORGANIZER', 'ADMIN')
  @HttpCode(200)
  checkIn(
    @Param('showtimeId', ParseUUIDPipe) showtimeId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException({
        code: 'INVALID_TICKET',
        message: 'Mã QR không hợp lệ.',
      });
    }

    return this.service.checkIn(
      showtimeId,
      (body as Record<string, unknown>).ticketId,
      request.user.id,
      request.user.roles,
    );
  }
}
