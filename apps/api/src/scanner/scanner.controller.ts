import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from '../auth/guards/session-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ScannerService, type OfflineScanItemDto } from './scanner.service.js';

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

  /**
   * S-35: Đồng bộ các lần quét ngoại tuyến lên máy chủ khi có mạng lại
   */
  @Post('showtimes/:showtimeId/sync')
  @Roles('STAFF', 'ADMIN', 'ORGANIZER')
  async syncOfflineScans(
    @Param('showtimeId') showtimeId: string,
    @Body() body: { scans: OfflineScanItemDto[] },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scannerService.syncOfflineScans(
      showtimeId,
      body.scans || [],
      req.user,
    );
  }

  /**
   * S-36: Ban tổ chức xem danh sách vé xung đột giữa các cửa
   */
  @Get('showtimes/:showtimeId/conflicts')
  @Roles('STAFF', 'ADMIN', 'ORGANIZER')
  async getShowtimeConflicts(
    @Param('showtimeId') showtimeId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scannerService.getShowtimeConflicts(showtimeId, req.user);
  }

  /**
   * S-52: Ban tổ chức xem số khách đã vào cửa theo thời gian thực
   */
  @Get('showtimes/:showtimeId/realtime-stats')
  @Roles('STAFF', 'ADMIN', 'ORGANIZER')
  async getRealtimeEntryStats(
    @Param('showtimeId') showtimeId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scannerService.getRealtimeEntryStats(showtimeId, req.user);
  }
}
