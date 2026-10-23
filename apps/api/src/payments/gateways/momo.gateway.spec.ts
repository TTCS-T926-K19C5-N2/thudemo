import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MomoGateway } from './momo.gateway.js';
import { PaymentGatewayOutcomeUnknownError } from './payment-gateway.errors.js';
import {
  buildMomoCreateRawString,
  buildMomoSignature,
  calculateHmacSha256,
} from './momo-signature.js';

describe('MomoGateway Adapter', () => {
  let gateway: MomoGateway;
  const accessKey = 'test_access_key';
  const secretKey = 'test_secret_key';
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    // This is an adapter unit test, not a provider sandbox acceptance test.
    // Never let CI latency or sandbox availability decide whether it passes.
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      Response.json({ payUrl: 'https://payment.example.invalid/fixture' }),
    );
    vi.stubGlobal('fetch', fetchMock);
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createPayment uses the client-persisted gatewayRef for the provider request', async () => {
    const orderId = 'd8248149-2e71-46ca-86b3-a3d827f8a701';
    const params = {
      orderId,
      gatewayRef: `${orderId}_1792770000000_ab12cd34`,
      amount: 250000,
      returnUrl: 'http://localhost:3000/payment/result',
    };
    const result = await gateway.createPayment(params);
    const retry = await gateway.createPayment(params);

    expect(result.gatewayRef).toBe(params.gatewayRef);
    expect(result.redirectUrl).toBeTruthy();
    expect(result.redirectUrl).toBe('https://payment.example.invalid/fixture');
    expect(retry.gatewayRef).toBe(params.gatewayRef);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const [index, payment] of [result, retry].entries()) {
      const [url, options] = fetchMock.mock.calls[index];
      expect(url).toBe('https://test-payment.momo.vn/v2/gateway/api/create');
      expect(options?.method).toBe('POST');
      const requestBody = JSON.parse(String(options?.body)) as Omit<
        Parameters<typeof buildMomoCreateRawString>[0],
        'accessKey'
      > & { signature: string };
      expect(requestBody.orderId).toBe(payment.gatewayRef);
      expect(requestBody.requestId).toBe(payment.gatewayRef);
      expect(requestBody.amount).toBe(params.amount);
      expect(requestBody.redirectUrl).toBe(params.returnUrl);
      expect(
        JSON.parse(
          Buffer.from(String(requestBody.extraData), 'base64').toString(),
        ),
      ).toEqual({ orderId });
      expect(requestBody.signature).toBe(
        calculateHmacSha256(
          buildMomoCreateRawString({ ...requestBody, accessKey }),
          secretKey,
        ),
      );
    }
  });

  it('does not fabricate a sandbox payment URL when transport outcome is unknown', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline fixture transport'));
    const params = {
      orderId: 'd8248149-2e71-46ca-86b3-a3d827f8a701',
      gatewayRef: 'd8248149-2e71-46ca-86b3-a3d827f8a701_1792770000000_ab12cd34',
      amount: 250000,
      returnUrl: 'http://localhost:3000/payment/result',
    };
    await expect(gateway.createPayment(params)).rejects.toBeInstanceOf(PaymentGatewayOutcomeUnknownError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses a caller-persisted gateway reference so an early webhook can be matched', async () => {
    const params = {
      orderId: 'd8248149-2e71-46ca-86b3-a3d827f8a701',
      gatewayRef: 'd8248149-2e71-46ca-86b3-a3d827f8a701_1792770000000_ab12cd34',
      amount: 250000,
      returnUrl: 'http://localhost:3000/payment/result',
    };
    const result = await gateway.createPayment(params);
    const [, options] = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(String(options?.body));
    expect(result.gatewayRef).toBe(params.gatewayRef);
    expect(body.orderId).toBe(params.gatewayRef);
    expect(body.requestId).toBe(params.gatewayRef);
  });

  it('treats a definitive provider resultCode rejection as retryable failure', async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ resultCode: 1006, message: 'declined' }));
    await expect(gateway.createPayment({
      orderId: 'd8248149-2e71-46ca-86b3-a3d827f8a701',
      gatewayRef: 'd8248149-2e71-46ca-86b3-a3d827f8a701_1792770000000_ab12cd34',
      amount: 250000,
      returnUrl: 'http://localhost:3000/payment/result',
    })).rejects.toMatchObject({
      providerCode: 'MOMO_1006',
    });
  });

  it('treats a provider 5xx response as outcome unknown, not a rejection', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('upstream failure', { status: 503 }));
    await expect(gateway.createPayment({
      orderId: 'd8248149-2e71-46ca-86b3-a3d827f8a701',
      gatewayRef: 'd8248149-2e71-46ca-86b3-a3d827f8a701_1792770000000_ab12cd34',
      amount: 250000,
      returnUrl: 'http://localhost:3000/payment/result',
    })).rejects.toBeInstanceOf(PaymentGatewayOutcomeUnknownError);
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
