import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MomoGateway } from './momo.gateway.js';
import { buildMomoSignature } from './momo-signature.js';

describe('MomoGateway Adapter', () => {
  let gateway: MomoGateway;
  const accessKey = 'test_access_key';
  const secretKey = 'test_secret_key';

  beforeEach(() => {
    const config = {
      get: vi.fn((key: string, defaultValue?: string) => {
        if (key === 'MOMO_PARTNER_CODE') return 'MOMO_PARTNER';
        if (key === 'MOMO_ACCESS_KEY') return accessKey;
        if (key === 'MOMO_SECRET_KEY') return secretKey;
        if (key === 'MOMO_ENDPOINT') return 'https://test-payment.momo.vn';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    gateway = new MomoGateway(config);
  });

  it('createPayment generates unique gatewayRef containing orderId', async () => {
    const orderId = 'd8248149-2e71-46ca-86b3-a3d827f8a701';
    const result = await gateway.createPayment({
      orderId,
      amount: 250000,
      returnUrl: 'http://localhost:3000/payment/result',
    });

    expect(result.gatewayRef).toContain(orderId);
    expect(result.redirectUrl).toBeTruthy();
  });

  it('verifyWebhook validates signature against secret key', async () => {
    const payload: Record<string, unknown> = {
      accessKey,
      partnerCode: 'MOMO_PARTNER',
      orderId: 'ord_123',
      requestId: 'req_123',
      amount: 250000,
      orderInfo: 'Ticket',
      orderType: 'momo_wallet',
      transId: '123456789',
      resultCode: 0,
      message: 'Success',
      payType: 'qr',
      responseTime: 1600000000000,
      extraData: '',
    };

    const signature = buildMomoSignature(payload, accessKey, secretKey);
    payload.signature = signature;

    const isValid = await gateway.verifyWebhook(payload, {});
    expect(isValid).toBe(true);

    // Invalid signature
    payload.signature = 'invalid_sig';
    const isInvalid = await gateway.verifyWebhook(payload, {});
    expect(isInvalid).toBe(false);
  });

  it('parseWebhook decodes internal orderId from extraData or gatewayRef prefix', async () => {
    const internalOrderId = 'd8248149-2e71-46ca-86b3-a3d827f8a701';
    const extraData = Buffer.from(
      JSON.stringify({ orderId: internalOrderId }),
    ).toString('base64');

    const payload = {
      orderId: `${internalOrderId}_1696000000_abc12`,
      transId: 'momo_trans_9999',
      amount: 250000,
      resultCode: 0,
      extraData,
    };

    const parsed = await gateway.parseWebhook(payload);
    expect(parsed.orderId).toBe(internalOrderId);
    expect(parsed.transactionId).toBe('momo_trans_9999');
    expect(parsed.amount).toBe(250000);
    expect(parsed.status).toBe('SUCCESS');
  });

  it('parseWebhook returns FAILED for non-zero resultCode', async () => {
    const internalOrderId = 'd8248149-2e71-46ca-86b3-a3d827f8a701';
    const payload = {
      orderId: `${internalOrderId}_1696000000_abc12`,
      transId: 'momo_trans_9999',
      amount: 250000,
      resultCode: 1006, // User cancelled
      extraData: '',
    };

    const parsed = await gateway.parseWebhook(payload);
    expect(parsed.orderId).toBe(internalOrderId);
    expect(parsed.status).toBe('FAILED');
  });
});
