import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';
import { Public } from '../auth/decorators/roles.decorator.js';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * SCRUM-32 (S-21): Cổng thanh toán gửi Webhook thông báo kết quả giao dịch
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RequestWithRawBody,
    @Headers('x-signature') headerSignature?: string,
  ) {
    const signature =
      headerSignature ||
      (req.headers['x-webhook-signature'] as string | undefined) ||
      (req.headers['signature'] as string | undefined);

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    // Lấy rawBody đã được kích hoạt trong NestFactory
    const rawBody =
      req.rawBody ??
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

    return this.paymentsService.handleWebhook(rawBody, signature, clientIp);
  }

  /**
   * SCRUM-33 (S-22): Kiểm tra trạng thái đơn hàng (Server-authoritative)
   */
  @Public()
  @Get('orders/:id/status')
  async getOrderStatus(@Param('id') id: string) {
    return this.paymentsService.getOrderStatus(id);
  }

  /**
   * Tạo đơn hàng mới để test hoặc đặt vé
   */
  @Public()
  @Post('orders')
  async createOrder(@Body() body: { eventId?: string; amount?: number }) {
    return this.paymentsService.createOrder(body);
  }

  /**
   * Tiện ích mô phỏng cổng thanh toán gửi webhook thành công
   */
  @Public()
  @Post('simulate-webhook')
  async simulateWebhook(
    @Req() req: Request,
    @Body() body: { orderCode: string; status?: string },
  ) {
    const payload = JSON.stringify({
      orderCode: body.orderCode,
      status: body.status || 'PAID',
      transactionId: `SIM-TXN-${Date.now()}`,
    });
    const signature = this.paymentsService.computeSignature(payload);
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      '127.0.0.1';

    return this.paymentsService.handleWebhook(payload, signature, clientIp);
  }
}
