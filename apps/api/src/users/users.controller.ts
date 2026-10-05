import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { Public } from '../auth/decorators/roles.decorator.js';

function bodyOf(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object'
    ? (body as Record<string, unknown>)
    : {};
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post('register')
  register(@Body() body: unknown) {
    const input = bodyOf(body);
    return this.usersService.register(input.email, input.password);
  }

  @Public()
  @Get('activate')
  activate(@Query('token') token: unknown) {
    return this.usersService.activate(token);
  }

  @Public()
  @Post('resend-activation')
  resendActivation(@Body() body: unknown) {
    return this.usersService.resendActivation(bodyOf(body).email);
  }

  // Dev-only substitute for a fake mailbox (S-03 story note). Never enabled
  // in production; T-07 owns the approved delivery flow.
  @Public()
  @Get('_dev/activation-outbox')
  activationOutbox(@Query('email') email: unknown) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    return this.usersService.listActivationLinks(email);
  }
}
