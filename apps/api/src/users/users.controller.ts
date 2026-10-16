import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Patch,
  Param,
  HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import { RegistrationService } from './registration.service.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly registration: RegistrationService,
  ) {}

  @Roles('ADMIN', 'ORGANIZER')
  @Post('staff')
  createStaff(@Body() body: any) {
    return this.usersService.createStaff(body.email, body.password);
  }

  @Roles('ADMIN', 'ORGANIZER')
  @Patch(':id/disable')
  disableAccount(@Param('id') id: string) {
    return this.usersService.disableAccount(id);
  }

  @Public()
  @Post('register')
  register(@Body() body: unknown) {
    return this.registration.register(body);
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
    return this.registration.activate(token);
  }

  @Public()
  @Post('resend-activation')
  resendActivation(@Body('email') email: unknown) {
    return this.registration.resend(email);
  }
}
