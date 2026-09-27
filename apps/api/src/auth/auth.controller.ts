import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Public, Roles } from './decorators/roles.decorator.js';
import { Role } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: any) {
    return this.authService.login(body.email, body.password);
  }

  // Example route to test roles
  @Roles(Role.ORGANIZER)
  @Get('organizer-only')
  getOrganizerData() {
    return { message: 'Hello Organizer' };
  }
}
