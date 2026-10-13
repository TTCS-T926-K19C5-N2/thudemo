import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ScannerModule } from '../scanner/scanner.module.js';
import { MyTicketsController } from './my-tickets.controller.js';
import { MyTicketsService } from './my-tickets.service.js';

@Module({
  imports: [PrismaModule, ScannerModule],
  controllers: [MyTicketsController],
  providers: [MyTicketsService],
})
export class MyTicketsModule {}
