import {
  Controller,
  Post,
  Get,
  Body,
  Patch,
  Param,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from '../users.service.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';

@Controller('admin/users')
@Roles('ADMIN')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers() {
    return this.usersService.getUsers();
  }

  @Post()
  async createUser(@Req() req: any, @Body() body: any) {
    return this.usersService.createAdminUser(
      req.user.id,
      body.email,
      body.password,
      body.role,
    );
  }

  @Patch(':id/role')
  async updateRole(@Req() req: any, @Param('id') id: string, @Body('role') role: string) {
    if (req.user.id === id) {
      throw new ForbiddenException('Cannot change your own role');
    }
    return this.usersService.updateUserRole(req.user.id, id, role);
  }

  @Patch(':id/status')
  async updateStatus(@Req() req: any, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    if (req.user.id === id) {
      throw new ForbiddenException('Cannot change your own status');
    }
    return this.usersService.updateUserStatus(req.user.id, id, isActive);
  }
}
