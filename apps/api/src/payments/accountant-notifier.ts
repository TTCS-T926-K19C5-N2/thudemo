import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { TicketDeliveryService } from '../tickets/ticket-delivery.service.js';

export interface MismatchAlertPayload {
  orderId: string;
  expectedAmount: number;
  receivedAmount: number;
  transactionId?: string;
  gatewayRef?: string;
  reason?: string;
}

export interface LatePaymentAlertPayload {
  orderId: string;
  amount: number;
  transactionId?: string;
  gatewayRef?: string;
  reason?: string;
}

@Injectable()
export class AccountantNotifier {
  private readonly logger = new Logger(AccountantNotifier.name);

  constructor(private readonly config: ConfigService, private readonly deliveries: TicketDeliveryService) {}

  async notifyAmountMismatch(payload: MismatchAlertPayload, tx?: Prisma.TransactionClient): Promise<void> {
    const accountantEmail = this.config.get<string>('ACCOUNTANT_EMAIL');

    this.logger.error(
      JSON.stringify({
        event: 'payment_amount_mismatch',
        alert: 'ACCOUNTANT_ALERT',
        message: 'Số tiền thanh toán nhận được khác với tổng tiền đơn hàng trong hệ thống!',
        ...payload,
        recipientConfigured: !!accountantEmail,
        timestamp: new Date().toISOString(),
      }),
    );

    await this.queue('AMOUNT_MISMATCH', payload.orderId, payload.gatewayRef ?? payload.transactionId ?? '', 'Cảnh báo: sai số tiền thanh toán', `Đơn ${payload.orderId}: số tiền kỳ vọng ${payload.expectedAmount} VND, nhận ${payload.receivedAmount} VND. Cần kiểm tra đối soát.`, tx);
  }

  async notifyLatePayment(payload: LatePaymentAlertPayload, tx?: Prisma.TransactionClient): Promise<void> {
    const accountantEmail = this.config.get<string>('ACCOUNTANT_EMAIL');

    this.logger.error(
      JSON.stringify({
        event: 'payment_late_received',
        alert: 'ACCOUNTANT_ALERT',
        message: 'Khách hàng thanh toán sau khi đơn hàng đã hết hạn!',
        ...payload,
        recipientConfigured: !!accountantEmail,
        timestamp: new Date().toISOString(),
      }),
    );

    await this.queue('LATE_PAYMENT', payload.orderId, payload.gatewayRef ?? payload.transactionId ?? '', 'Cảnh báo: thanh toán quá hạn hoặc trả trùng', `Đơn ${payload.orderId}: ghi nhận ${payload.amount} VND cần kiểm tra và xử lý hoàn tiền. Không tự cấp thêm vé.`, tx);
  }
  private async queue(kind: string, orderId: string, reference: string, subject: string, text: string, tx?: Prisma.TransactionClient) {
    const key = createHash('sha256').update(`${kind}:${orderId}:${reference}`).digest('hex');
    await this.deliveries.enqueueNotification(orderId, `accountant:${key}`, { kind: 'ACCOUNTANT', subject, text }, tx);
  }

}
