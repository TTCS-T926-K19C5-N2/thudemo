import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { Public } from '../auth/decorators/roles.decorator.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post('register')
  register(@Body() body: any) {
    return this.usersService.register(body.email, body.password);
  }

  @Public()
  @Get('activate')
  activate(@Query('token') token: unknown) {
    return this.usersService.activate(token);
  }

  @Public()
  @Post('resend-activation')
  resendActivation(@Body('email') email: string) {
    return this.usersService.resendActivation(email);
  }
}
