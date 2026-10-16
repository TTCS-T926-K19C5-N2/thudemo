import { Module } from '@nestjs/common';
import { CheckInControllerS29 } from './check-in-s29.controller.js';
import { CheckInServiceS29 } from './check-in-s29.service.js';

@Module({
  controllers: [CheckInControllerS29],
  providers: [CheckInServiceS29],
})
export class CheckInModuleS29 {}
