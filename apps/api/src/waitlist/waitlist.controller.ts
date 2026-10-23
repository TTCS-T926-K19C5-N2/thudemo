import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { WaitlistService } from './waitlist.service.js';

@Controller('showtimes/:showtimeId/waitlist')
@Roles('BUYER')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Get()
  current(
    @Param('showtimeId', ParseUUIDPipe) showtimeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.waitlist.current(showtimeId, request.user.id);
  }

  @Post()
  @HttpCode(200)
  join(
    @Param('showtimeId', ParseUUIDPipe) showtimeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.waitlist.join(showtimeId, request.user.id);
  }

  @Delete()
  @HttpCode(200)
  unsubscribe(
    @Param('showtimeId', ParseUUIDPipe) showtimeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.waitlist.unsubscribe(showtimeId, request.user.id);
  }
}
