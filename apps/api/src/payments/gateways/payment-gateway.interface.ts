export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  currency?: string;
  returnUrl: string;
  ipnUrl?: string;
  extraData?: string;
}

export interface CreatePaymentResult {
  redirectUrl: string;
  gatewayRef: string;
}

export type PaymentWebhookStatus = 'SUCCESS' | 'FAILED';

export interface PaymentWebhookEvent {
  transactionId: string;
  orderId: string;
  gatewayRef: string;
  amount: number;
  status: PaymentWebhookStatus;
  rawPayload?: unknown;
}

export interface PaymentGateway {
  readonly name: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  verifyWebhook(
    rawBody: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<boolean>;
  parseWebhook(rawBody: unknown): Promise<PaymentWebhookEvent>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
