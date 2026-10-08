import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MockPaymentGateway, MOCK_ACCESS_KEY } from './mock.gateway.js';
import { buildMomoSignature } from './momo-signature.js';

describe('MockPaymentGateway', () => {
  let gateway: MockPaymentGateway;
  const mockSecret = 'mock_secret_test_123';

  beforeEach(() => {
    const configMap: Record<string, string> = {
      PAYMENT_WEBHOOK_SECRET: mockSecret,
      WEB_ORIGIN: 'http://localhost:3000',
    };
    const mockConfig = {
      get: (key: string, defaultValue?: string) => configMap[key] ?? defaultValue,
    } as unknown as ConfigService;

    gateway = new MockPaymentGateway(mockConfig);
  });

  describe('createPayment', () => {
    it('generates internal redirectUrl and unique gatewayRef containing orderId', async () => {
      const orderId = '11111111-1111-4111-8111-111111111111';
      const result = await gateway.createPayment({
        orderId,
        amount: 300000,
        returnUrl: `http://localhost:3000/payment/result?orderId=${orderId}`,
      });

      expect(result.gatewayRef).toContain(orderId);
      expect(result.redirectUrl).toContain('http://localhost:3000/mock-gateway/pay');
      expect(result.redirectUrl).toContain(`orderId=${orderId}`);
      expect(result.redirectUrl).toContain('amount=300000');
      expect(result.redirectUrl).toContain(`gatewayRef=${encodeURIComponent(result.gatewayRef)}`);
      expect(result.redirectUrl).toContain('returnUrl=');
    });
  });

  describe('verifyWebhook', () => {
    it('returns true for payload signed with MOCK_ACCESS_KEY and PAYMENT_WEBHOOK_SECRET', async () => {
      const payload: Record<string, unknown> = {
        partnerCode: 'MOCK',
        orderId: 'order_123',
        requestId: 'order_123',
        amount: 250000,
        orderInfo: 'Test mock order',
        orderType: 'momo_wallet',
        transId: 'mock_tx_999',
        resultCode: 0,
        message: 'Success',
        payType: 'qr',
        responseTime: 1791370000000,
        extraData: '',
      };

      const signature = buildMomoSignature(payload, MOCK_ACCESS_KEY, mockSecret);
      payload.signature = signature;

      const isValid = await gateway.verifyWebhook(payload, {});
      expect(isValid).toBe(true);
    });

    it('returns false when signature does not match', async () => {
      const payload: Record<string, unknown> = {
        partnerCode: 'MOCK',
        orderId: 'order_123',
        amount: 250000,
        signature: 'invalid_signature_hex',
      };

      const isValid = await gateway.verifyWebhook(payload, {});
      expect(isValid).toBe(false);
    });

    it('returns false when signature is missing or payload is invalid', async () => {
      expect(await gateway.verifyWebhook({}, {})).toBe(false);
      expect(await gateway.verifyWebhook(null, {})).toBe(false);
      expect(await gateway.verifyWebhook('string', {})).toBe(false);
    });
  });

  describe('parseWebhook', () => {
    it('parses successful webhook payload into internal event with status SUCCESS', async () => {
      const orderId = '22222222-2222-4222-8222-222222222222';
      const gatewayRef = `${orderId}_1791370000_abc123`;
      const payload = {
        orderId: gatewayRef,
        transId: 'mock_tx_456',
        amount: 150000,
        resultCode: 0,
        extraData: Buffer.from(JSON.stringify({ orderId })).toString('base64'),
      };

      const event = await gateway.parseWebhook(payload);
      expect(event.transactionId).toBe('mock_tx_456');
      expect(event.orderId).toBe(orderId);
      expect(event.gatewayRef).toBe(gatewayRef);
      expect(event.amount).toBe(150000);
      expect(event.status).toBe('SUCCESS');
    });

    it('parses failed webhook payload with status FAILED', async () => {
      const orderId = '33333333-3333-4333-8333-333333333333';
      const gatewayRef = `${orderId}_1791370000_xyz789`;
      const payload = {
        orderId: gatewayRef,
        transId: 'mock_tx_789',
        amount: 150000,
        resultCode: 49, // user cancelled
        extraData: Buffer.from(JSON.stringify({ orderId })).toString('base64'),
      };

      const event = await gateway.parseWebhook(payload);
      expect(event.transactionId).toBe('mock_tx_789');
      expect(event.orderId).toBe(orderId);
      expect(event.status).toBe('FAILED');
    });
  });
});
