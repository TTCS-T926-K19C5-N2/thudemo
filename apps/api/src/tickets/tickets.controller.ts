import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { ScannerCryptoService } from '../scanner/scanner-crypto.service.js';
import { TicketsService } from './tickets.service.js';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly signing: ScannerCryptoService) {}

  // Public keys only. Scanners download them ahead of time to verify QR
  // signatures offline.
  @Public()
  @Get('public-keys')
  getPublicKeys() {
    return {
      keys: this.signing
        .getPublicKeys()
        .map(({ keyId, key }) => ({ keyId, key, publicKey: key })),
    };
  }
}

@Controller('orders/:id/tickets')
export class OrderTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post(':ticketId/transfer')
  @Roles('BUYER')
  async transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body('toEmail') toEmail: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!toEmail || typeof toEmail !== 'string') {
      throw new BadRequestException('Email không hợp lệ');
    }
    await this.tickets.transferTicket(id, ticketId, req.user.id, toEmail);
    return { success: true };
  }
}
