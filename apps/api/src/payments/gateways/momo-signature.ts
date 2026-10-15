import { createHmac, timingSafeEqual } from 'node:crypto';

export const MOMO_IPN_SIGNATURE_FIELDS = [
  'accessKey',
  'amount',
  'extraData',
  'message',
  'orderId',
  'orderInfo',
  'orderType',
  'partnerCode',
  'payType',
  'requestId',
  'responseTime',
  'resultCode',
  'transId',
] as const;

export function buildMomoIpnRawString(
  payload: Record<string, unknown>,
  accessKey?: string,
): string {
  const parts: string[] = [];
  for (const field of MOMO_IPN_SIGNATURE_FIELDS) {
    if (field === 'accessKey') {
      const val = String(accessKey ?? payload.accessKey ?? '');
      parts.push(`accessKey=${val}`);
    } else {
      const rawVal = payload[field];
      const val =
        rawVal !== undefined && rawVal !== null
          ? typeof rawVal === 'string'
            ? rawVal
            : typeof rawVal === 'number' || typeof rawVal === 'boolean'
              ? String(rawVal)
              : ''
          : '';
      parts.push(`${field}=${val}`);
    }
  }
  return parts.join('&');
}

export function buildMomoCreateRawString(params: {
  accessKey: string;
  amount: number;
  extraData: string;
  ipnUrl: string;
  orderId: string;
  orderInfo: string;
  partnerCode: string;
  redirectUrl: string;
  requestId: string;
  requestType: string;
}): string {
  return [
    `accessKey=${params.accessKey}`,
    `amount=${params.amount}`,
    `extraData=${params.extraData}`,
    `ipnUrl=${params.ipnUrl}`,
    `orderId=${params.orderId}`,
    `orderInfo=${params.orderInfo}`,
    `partnerCode=${params.partnerCode}`,
    `redirectUrl=${params.redirectUrl}`,
    `requestId=${params.requestId}`,
    `requestType=${params.requestType}`,
  ].join('&');
}

export function calculateHmacSha256(rawString: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(rawString).digest('hex');
}

export function buildMomoSignature(
  payload: Record<string, unknown>,
  accessKey: string,
  secretKey: string,
): string {
  const raw = buildMomoIpnRawString(payload, accessKey);
  return calculateHmacSha256(raw, secretKey);
}

export function verifyTimingSafeSignature(
  actual: string,
  expected: string,
): boolean {
  if (!actual || !expected) return false;
  try {
    const bufActual = Buffer.from(actual, 'utf8');
    const bufExpected = Buffer.from(expected, 'utf8');
    if (bufActual.length !== bufExpected.length) return false;
    return timingSafeEqual(bufActual, bufExpected);
  } catch {
    return false;
  }
}
