import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  Header,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { UsersService } from './users.service.js';
import { adminBody } from './admin-input.js';

@Controller('admin/users')
@Roles('ADMIN')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('page') page: unknown) {
    return this.users.list(page);
  }
  @Get('scanner-showtimes')
  @Header('Cache-Control', 'no-store')
  scannerShowtimes() {
    return this.users.scannerShowtimes();
  }

  @Post(':id/assignment')
  assignment(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() value: unknown,
  ) {
    return this.users.assignGate(req.user.id, id, value);
  }
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() value: unknown) {
    return this.users.createEmployee(req.user.id, value);
  }
  @Patch(':id/role')
  role(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() value: unknown,
  ) {
    return this.users.changeRole(req.user.id, id, adminBody(value).role);
  }
  @Patch(':id/status')
  status(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() value: unknown,
  ) {
    return this.users.setActive(req.user.id, id, adminBody(value).isActive);
  }
}
