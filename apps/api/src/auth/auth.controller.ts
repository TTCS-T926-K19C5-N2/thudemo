import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './auth.service.js';
import { Public, Roles } from './decorators/roles.decorator.js';
import { ROLE_NAMES } from './roles.js';
import type { AuthenticatedRequest } from './guards/session-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const session = await this.authService.login(input.email, input.password);
    response.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
    return { status: 'ok', expiresAt: session.expiresAt.toISOString() };
  }

  @Roles(...ROLE_NAMES)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @Roles(...ROLE_NAMES)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(request.sessionToken);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    return { status: 'ok' };
  }

  // Example route to test roles
  @Roles('ORGANIZER')
  @Get('organizer-only')
  getOrganizerData() {
    return { message: 'Hello Organizer' };
  }
}
