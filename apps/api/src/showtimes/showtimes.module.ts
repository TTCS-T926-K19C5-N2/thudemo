import { Module } from '@nestjs/common';
import { ShowtimesController } from './showtimes.controller.js';
import { ShowtimesService } from './showtimes.service.js';
@Module({ controllers: [ShowtimesController], providers: [ShowtimesService] })
export class ShowtimesModule {}
