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
import { scanCommand } from './admission-contract.js';
import { TicketCheckInService } from './ticket-check-in.service.js';

@Controller('showtimes')
@Roles('STAFF', 'ORGANIZER', 'ADMIN')
export class TicketCheckInController {
  constructor(private readonly service: TicketCheckInService) {}
  @Get(':showtimeId/check-in/gates')
  gates(
    @Param('showtimeId', ParseUUIDPipe) showtimeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.gates(showtimeId, request);
  }
  @Post(':showtimeId/check-in')
  @HttpCode(200)
  checkIn(
    @Param('showtimeId', ParseUUIDPipe) showtimeId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.checkIn(showtimeId, scanCommand(body), request);
  }
}
