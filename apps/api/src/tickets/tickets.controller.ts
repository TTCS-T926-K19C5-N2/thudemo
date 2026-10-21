import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Query,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { ScannerCryptoService } from '../scanner/scanner-crypto.service.js';
import { TicketsService } from './tickets.service.js';
import { TicketDeliveryService } from './ticket-delivery.service.js';
import { TicketQrService } from '../orders/ticket-qr.service.js';
import { orderPagination } from '../orders/order-pagination.js';

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly signing: ScannerCryptoService,
    private readonly delivery: TicketDeliveryService,
    private readonly projection: TicketQrService,
  ) {}

  @Get('me')
  @Roles('BUYER')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  myTickets(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: unknown,
    @Query('pageSize') pageSize?: unknown,
  ) {
    return this.projection.forBuyer(
      req.user.id,
      orderPagination({ page, pageSize }),
    );
  }

  @Get('mail-failures')
  @Roles('ADMIN')
  @Header('Cache-Control', 'private, no-store')
  mailFailures() {
    return this.delivery.failures();
  }

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
  constructor(
    private readonly tickets: TicketsService,
    private readonly delivery: TicketDeliveryService,
  ) {}

  @Post('resend')
  @Roles('BUYER')
  resend(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() value: unknown,
  ) {
    return this.delivery.resend(id, req.user.id, value);
  }

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

  @Post(':ticketId/cancel')
  @Roles('BUYER')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tickets.cancelTicket(id, ticketId, req.user.id);
    return { success: true };
  }
}
