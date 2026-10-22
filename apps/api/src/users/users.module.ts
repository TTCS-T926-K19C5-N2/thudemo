import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { MailModule } from '../mail/mail.module.js';
import { RegistrationService } from './registration.service.js';
import { RegistrationSettings } from './registration-settings.js';
import { ActivationDeliveryService } from './activation-delivery.service.js';
import { AdminUsersController } from './admin-users.controller.js';

@Module({
  imports: [MailModule],
  controllers: [UsersController, AdminUsersController],
  providers: [
    UsersService,
    RegistrationService,
    RegistrationSettings,
    ActivationDeliveryService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
