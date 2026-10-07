import { describe, it, expect } from 'vitest';
import {
  buildMomoIpnRawString,
  buildMomoSignature,
  verifyTimingSafeSignature,
} from './momo-signature.js';

describe('MoMo Signature Utility', () => {
  const secretKey = 'test_secret_key';
  const accessKey = 'test_access_key';

  it('builds raw string for IPN in alphabetical order', () => {
    const payload = {
      orderId: 'ord_123',
      amount: 150000,
      partnerCode: 'MOMO',
      requestId: 'req_123',
      transId: '999999',
      resultCode: 0,
      message: 'Success',
      responseTime: 1600000000000,
      extraData: '',
      payType: 'qr',
      orderInfo: 'Ticket',
      orderType: 'momo_wallet',
    };

    const raw = buildMomoIpnRawString(payload, accessKey);
    expect(raw).toBe(
      'accessKey=test_access_key&amount=150000&extraData=&message=Success&orderId=ord_123&orderInfo=Ticket&orderType=momo_wallet&partnerCode=MOMO&payType=qr&requestId=req_123&responseTime=1600000000000&resultCode=0&transId=999999',
    );
  });

  it('calculates reproducible HMAC-SHA256 signature', () => {
    const payload = {
      orderId: 'ord_123',
      amount: 150000,
      partnerCode: 'MOMO',
      requestId: 'req_123',
      transId: '999999',
      resultCode: 0,
      message: 'Success',
      responseTime: 1600000000000,
      extraData: '',
      payType: 'qr',
      orderInfo: 'Ticket',
      orderType: 'momo_wallet',
    };

    const sig1 = buildMomoSignature(payload, accessKey, secretKey);
    const sig2 = buildMomoSignature(payload, accessKey, secretKey);
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64); // SHA-256 hex length
  });

  it('verifies timing-safe signatures accurately', () => {
    const valid = 'a1b2c3d4e5f6';
    expect(verifyTimingSafeSignature(valid, valid)).toBe(true);
    expect(verifyTimingSafeSignature(valid, 'a1b2c3d4e5f7')).toBe(false);
    expect(verifyTimingSafeSignature(valid, 'short')).toBe(false);
    expect(verifyTimingSafeSignature('', valid)).toBe(false);
  });
});
