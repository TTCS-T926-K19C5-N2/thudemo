import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CheckInServiceS29 } from './check-in-s29.service.js';

@Controller('check-in')
export class CheckInControllerS29 {
  constructor(private readonly service: CheckInServiceS29) {}

  @Roles('STAFF')
  @Get('today')
  getTodayShowtimes() {
    return this.service.getTodayShowtimes();
  }
}
