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
  ParseUUIDPipe,
  Header,
} from '@nestjs/common';
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from '../auth/guards/session-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ScannerService } from './scanner.service.js';
import { OfflineAdmissionsService } from './offline-admissions.service.js';
import { ScannerSnapshotService } from './scanner-snapshot.service.js';
import { orderPagination } from '../orders/order-pagination.js';

@Controller('scanner')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ScannerController {
  constructor(
    private readonly scannerService: ScannerService,
    private readonly offline: OfflineAdmissionsService,
    private readonly snapshots: ScannerSnapshotService,
  ) {}

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
  @Header('Cache-Control', 'private, no-store')
  @Roles('STAFF', 'ADMIN', 'ORGANIZER')
  async getShowtimeTickets(
    @Param('showtimeId', ParseUUIDPipe) showtimeId: string,
    @Query('since') since: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.snapshots.snapshot(showtimeId, since, req.user);
  }

  @Post('sync-scans')
  @HttpCode(200)
  @Roles('STAFF')
  async syncOfflineScans(
    @Body()
    body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.offline.sync(body, req);
  }

  @Get('showtimes/:showtimeId/conflicts')
  @Header('Cache-Control', 'private, no-store')
  @Roles('ADMIN', 'ORGANIZER')
  conflicts(
    @Param('showtimeId', ParseUUIDPipe) showtimeId: string,
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: unknown,
  ) {
    return this.offline.conflicts(
      showtimeId,
      req,
      orderPagination({ page, pageSize: '20' }),
    );
  }
}
