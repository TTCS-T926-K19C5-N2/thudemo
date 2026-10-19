import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  offlineScanCommands,
  offlineScanHash,
} from './offline-scan-contract.js';
const scan = () => ({
  scanId: randomUUID(),
  showtimeId: randomUUID(),
  gateId: randomUUID(),
  ticketCode: randomUUID(),
  qrPayload: 'ET1.fixture',
  deviceId: 'device_fixture_1',
  scannedAt: '2026-10-19T12:00:00.000Z',
  deviceSentAt: '2026-10-19T12:01:00.000Z',
  mode: 'offline_admission',
});
describe('durable offline sync input contract', () => {
  it('accepts40 distinct scans and rejects a41st or duplicate scan identity', () => {
    const scans = Array.from({ length: 40 }, scan);
    expect(offlineScanCommands({ scans })).toHaveLength(40);
    expect(() => offlineScanCommands({ scans: [...scans, scan()] })).toThrow();
    expect(() =>
      offlineScanCommands({ scans: [scans[0], scans[0]] }),
    ).toThrow();
  });
  it('rejects malformed dates, gates, unsigned legacy records and client staff identity', () => {
    for (const patch of [
      { gateId: 'gateA' },
      { qrPayload: 'legacy' },
      { scannedAt: '2026-02-30T12:00:00.000Z' },
      { staffId: randomUUID() },
      { mode: 'unknown' },
      { deviceSentAt: 'invalid' },
    ])
      expect(() =>
        offlineScanCommands({ scans: [{ ...scan(), ...patch }] }),
      ).toThrow();
  });
  it('binds replay to staff, payload, gate and original device time but permits later upload time', () => {
    const command = offlineScanCommands({ scans: [scan()] })[0],
      actor = randomUUID();
    const hash = offlineScanHash(command, actor);
    expect(
      offlineScanHash(
        { ...command, deviceSentAt: '2026-10-19T13:00:00.000Z' },
        actor,
      ),
    ).toBe(hash);
    for (const patch of [
      { qrPayload: 'ET1.changed' },
      { gateId: randomUUID() },
      { scannedAt: '2026-10-19T12:00:01.000Z' },
    ])
      expect(offlineScanHash({ ...command, ...patch }, actor)).not.toBe(hash);
    expect(offlineScanHash(command, randomUUID())).not.toBe(hash);
  });
});
