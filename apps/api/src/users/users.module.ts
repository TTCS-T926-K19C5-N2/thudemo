import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { MailModule } from '../mail/mail.module.js';
import { RegistrationService } from './registration.service.js';
import { RegistrationSettings } from './registration-settings.js';
import { ActivationDeliveryService } from './activation-delivery.service.js';

@Module({
  imports: [MailModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    RegistrationService,
    RegistrationSettings,
    ActivationDeliveryService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
