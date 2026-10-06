import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { hashSessionToken } from '../auth/auth.service.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { HoldsService } from './holds.service.js';

@Controller('showtimes/:id/holds')
@Roles('BUYER')
export class HoldsController {
  constructor(private readonly service: HoldsService) {}

  // Chỉ áp dụng Rate Limit cho API Giữ ghế
  @UseGuards(CustomThrottlerGuard)
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