import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { MailService } from './mail.service.js';
import { UsersController } from './users.controller.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, MailService],
  exports: [UsersService],
})
export class UsersModule {}
