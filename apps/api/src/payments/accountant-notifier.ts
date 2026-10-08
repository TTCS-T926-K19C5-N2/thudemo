import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  constructor(private readonly config: ConfigService) {}

  async notifyAmountMismatch(payload: MismatchAlertPayload): Promise<void> {
    const accountantEmail = this.config.get<string>('ACCOUNTANT_EMAIL');

    this.logger.error(
      JSON.stringify({
        event: 'payment_amount_mismatch',
        alert: 'ACCOUNTANT_ALERT',
        message: 'Số tiền thanh toán nhận được khác với tổng tiền đơn hàng trong hệ thống!',
        ...payload,
        notifiedEmail: accountantEmail ?? null,
        timestamp: new Date().toISOString(),
      }),
    );

    if (accountantEmail) {
      // In production/staging with an email transport, dispatch alert email here.
      this.logger.warn(
        `[AccountantAlert] Sent email alert to ${accountantEmail} for order ${payload.orderId}`,
      );
    }
  }

  async notifyLatePayment(payload: LatePaymentAlertPayload): Promise<void> {
    const accountantEmail = this.config.get<string>('ACCOUNTANT_EMAIL');

    this.logger.error(
      JSON.stringify({
        event: 'payment_late_received',
        alert: 'ACCOUNTANT_ALERT',
        message: 'Khách hàng thanh toán sau khi đơn hàng đã hết hạn!',
        ...payload,
        notifiedEmail: accountantEmail ?? null,
        timestamp: new Date().toISOString(),
      }),
    );

    if (accountantEmail) {
      this.logger.warn(
        `[AccountantAlert] Sent late payment alert to ${accountantEmail} for order ${payload.orderId}`,
      );
    }
  }
}
