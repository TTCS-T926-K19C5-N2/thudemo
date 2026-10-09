import { Module } from '@nestjs/common';
import { ScannerController } from './scanner.controller.js';
import { ScannerService } from './scanner.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';

@Module({
  imports: [PrismaModule, TicketsModule],
  controllers: [ScannerController],
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}
