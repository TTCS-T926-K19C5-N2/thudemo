import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators/roles.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
