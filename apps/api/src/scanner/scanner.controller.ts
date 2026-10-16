import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from '../auth/guards/session-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ScannerService } from './scanner.service.js';

@Controller('scanner')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Get('qr-keys')
  @Roles('STAFF', 'ADMIN', 'ORGANIZER')
  keys() {
    return this.scannerService.publicKeys();
  }

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
    return this.scannerService.getShowtimeTickets(showtimeId, since, req.user);
  }

  @Post('sync-scans')
  @HttpCode(200)
  @Roles('STAFF', 'ADMIN', 'ORGANIZER')
  async syncOfflineScans(
    @Body()
    body: {
      scans?: {
        scanId: string;
        ticketCode: string;
        showtimeId: string;
        gateId?: string;
        scannedAt: string;
        deviceId: string;
      }[];
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const scans = Array.isArray(body?.scans) ? body.scans : [];
    return this.scannerService.syncOfflineScans(scans, req.user);
  }
}

