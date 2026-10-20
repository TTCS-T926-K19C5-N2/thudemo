import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ScannerModule } from '../scanner/scanner.module.js';
import { TicketQrService } from '../orders/ticket-qr.service.js';

// One owner projection for HTTP, email and downloads. ScannerModule does not
// depend on Orders/Tickets, so both callers can import this without a cycle.
@Module({
  imports: [PrismaModule, ScannerModule],
  providers: [TicketQrService],
  exports: [TicketQrService, ScannerModule],
})
export class TicketProjectionModule {}
