import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type OfflineScanCommand = {
  scanId: string;
  showtimeId: string;
  gateId: string;
  qrPayload: string;
  ticketCode: string;
  deviceId: string;
  scannedAt: string;
  deviceSentAt: string;
  mode: 'offline_admission' | 'online_confirmation';
};
export function offlineScanCommands(value: unknown): OfflineScanCommand[] {
  const invalid = () =>
    new BadRequestException({
      code: 'INVALID_SYNC',
      message:
        'Lô đồng bộ không hợp lệ. Giữ hàng đợi và kiểm tra cấu hình máy.',
    });
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const scans = (value as Record<string, unknown>).scans;
  if (!Array.isArray(scans) || scans.length < 1 || scans.length > 40)
    throw invalid();
  const seen = new Set<string>();
  return scans.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
    const item = raw as Record<string, unknown>;
    for (const key of ['scanId', 'showtimeId', 'gateId', 'ticketCode'])
      if (typeof item[key] !== 'string' || !uuid.test(item[key]))
        throw invalid();
    if (
      typeof item.qrPayload !== 'string' ||
      !item.qrPayload.startsWith('ET1.') ||
      item.qrPayload.length > 256 ||
      typeof item.deviceId !== 'string' ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(item.deviceId) ||
      !['offline_admission', 'online_confirmation'].includes(
        String(item.mode),
      ) ||
      'staffId' in item
    )
      throw invalid();
    for (const key of ['scannedAt', 'deviceSentAt']) {
      if (
        typeof item[key] !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item[key]) ||
        !Number.isFinite(Date.parse(item[key])) ||
        new Date(item[key]).toISOString() !== item[key]
      )
        throw invalid();
    }
    const scanId = (item.scanId as string).toLowerCase();
    if (seen.has(scanId)) throw invalid();
    seen.add(scanId);
    return {
      scanId,
      showtimeId: (item.showtimeId as string).toLowerCase(),
      gateId: (item.gateId as string).toLowerCase(),
      ticketCode: (item.ticketCode as string).toLowerCase(),
      qrPayload: item.qrPayload,
      deviceId: item.deviceId,
      scannedAt: item.scannedAt as string,
      deviceSentAt: item.deviceSentAt as string,
      mode: item.mode as OfflineScanCommand['mode'],
    };
  });
}
export function offlineScanHash(item: OfflineScanCommand, staffId: string) {
  // Upload time changes on retry; it is not part of the original scan identity.
  const { deviceSentAt: _sentAt, ...scan } = item;
  return createHash('sha256')
    .update(JSON.stringify({ staffId, ...scan }))
    .digest('hex');
}
