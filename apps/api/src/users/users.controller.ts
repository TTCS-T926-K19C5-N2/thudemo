import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Patch,
  Param,
  HttpCode,
  Req,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  canonicalPeer,
  verifyLoginPeer,
  LOGIN_PEER_HEADER,
} from 'shared/login-peer';
import { UsersService } from './users.service.js';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import { RegistrationService } from './registration.service.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { adminBody } from './admin-input.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly registration: RegistrationService,
  ) {}

  private peer(request: Request): string {
    try {
      const header = request.headers[LOGIN_PEER_HEADER];
      return header === undefined
        ? canonicalPeer(request.socket.remoteAddress)
        : verifyLoginPeer(
            typeof header === 'string' ? header : '',
            process.env.AUTH_PROXY_SECRET,
          );
    } catch {
      throw new ForbiddenException('Nguồn đăng ký không hợp lệ.');
    }
  }

  @Roles('ADMIN')
  @Post('staff')
  async createStaff(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = adminBody(body);
    const user = await this.usersService.createEmployee(request.user.id, {
      email: input.email,
      password: input.password,
      role: 'STAFF',
    });
    return { message: 'Staff account created successfully', id: user.id };
  }

  @Roles('ADMIN')
  @Patch(':id/disable')
  async disableAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.usersService.setActive(request.user.id, id, false);
    return { message: 'Account disabled successfully' };
  }

  @Public()
  @Post('register')
  register(@Body() body: unknown, @Req() request: Request) {
    return this.registration.register(body, this.peer(request));
  }

  @Public()
  @Get('registration-notice')
  notice() {
    return this.registration.notice();
  }

  @Public()
  @Get('activate')
  activate(@Query('token') token: unknown) {
    return this.registration.activate(token);
  }

  @Public()
  @Post('activate')
  @HttpCode(200)
  activateBody(@Body() body: unknown) {
    const token =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).token
        : undefined;
    const password =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).password
        : undefined;
    return this.registration.activate(token, password);
  }

  @Public()
  @Post('resend-activation')
  resendActivation(@Body('email') email: unknown, @Req() request: Request) {
    return this.registration.resend(email, this.peer(request));
  }
}
