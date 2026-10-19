import { Controller, Get, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CheckInServiceS29 } from './check-in-s29.service.js';

@Controller('check-in')
export class CheckInControllerS29 {
  constructor(private readonly service: CheckInServiceS29) {}

  @Roles('STAFF')
  @Get('today')
  getTodayShowtimes(@Req() req: AuthenticatedRequest) {
    return this.service.getTodayShowtimes(req.user.id);
  }
}
