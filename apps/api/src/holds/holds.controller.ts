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
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { hashSessionToken } from '../auth/auth.service.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { HoldsService } from './holds.service.js';

@Controller('showtimes/:id/holds')
@Roles('BUYER')
export class HoldsController {
  constructor(private readonly service: HoldsService) {}

  // Giới hạn API Giữ ghế: Tối đa 10 yêu cầu trong 60.000 ms (1 phút)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @HttpCode(200)
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.claim(
      id,
      req.user.id,
      hashSessionToken(req.sessionToken),
      body,
    );
  }

  @Get()
  current(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.current(
      id,
      req.user.id,
      hashSessionToken(req.sessionToken),
    );
  }
}