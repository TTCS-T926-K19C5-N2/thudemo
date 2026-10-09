import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard, type AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ScannerService } from './scanner.service.js';

@Controller('scanner')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Get('showtimes')
  @Roles('STAFF', 'ADMIN', 'ORGANIZER')
  async getAssignedShowtimes(@Req() req: AuthenticatedRequest) {
    return this.scannerService.getAssignedShowtimes(
      req.user.id,
      req.user.roles,
    );
  }

  @Get('showtimes/:showtimeId/tickets')
  @Roles('STAFF', 'ADMIN', 'ORGANIZER')
  async getShowtimeTickets(
    @Param('showtimeId') showtimeId: string,
    @Query('since') since: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scannerService.getShowtimeTickets(
      showtimeId,
      since,
      req.user,
    );
  }
}
