import { describe, it, expect } from 'vitest';
import {
  assertCancellationWindow,
  DEMO_CANCELLATION_POLICY,
} from './cancellations.service.js';
import { MockRefundGateway } from './mock-refund.gateway.js';
import { parseDemoStatement, reconcileRows } from './reports.service.js';
import { boundedConfig } from '../booking-access/booking-access.service.js';

describe('S45 demo cancellation policy', () => {
  const now = new Date('2026-10-22T00:00:00Z');
  it('allows exact24h boundary and full-order100percent policy', () => {
    expect(() =>
      assertCancellationWindow(new Date('2026-10-23T00:00:00Z'), now, false),
    ).not.toThrow();
    expect(DEMO_CANCELLATION_POLICY.refundPercent).toBe(100);
  });
  it('rejects one millisecond after cutoff and any already-admitted ticket', () => {
    expect(() =>
      assertCancellationWindow(
        new Date('2026-10-22T23:59:59.999Z'),
        now,
        false,
      ),
    ).toThrow(/24/);
    expect(() =>
      assertCancellationWindow(new Date('2026-10-25T00:00:00Z'), now, true),
    ).toThrow(/soát/);
  });
});
describe('S48 mock provider replay and failures', () => {
  it('same refundID produces same reference even on retries', async () => {
    const g = new MockRefundGateway();
    expect(await g.refund('r1', 100, 1)).toEqual(await g.refund('r1', 100, 2));
  });
  it('fails configured attempts and never accepts fractional/negative amounts', async () => {
    const g = new MockRefundGateway(2);
    expect((await g.refund('r', 100, 1)).status).toBe('FAILED');
    expect((await g.refund('r', 100, 2)).status).toBe('FAILED');
    expect((await g.refund('r', 100, 3)).status).toBe('SUCCEEDED');
    expect((await g.refund('r', -1, 3)).status).toBe('FAILED');
    expect((await g.refund('r', 1.5, 3)).status).toBe('FAILED');
  });
});
describe('S51 statement import', () => {
  it('classifies all4required groups', () => {
    const r = reconcileRows(
      [
        { transactionId: 'match', amount: 100 },
        { transactionId: 'bank-only', amount: 50 },
        { transactionId: 'mismatch', amount: 200 },
      ],
      [
        { transactionId: 'match', amount: 100 },
        { transactionId: 'app-only', amount: 70 },
        { transactionId: 'mismatch', amount: 199 },
      ],
    );
    expect(r.map((x) => x.classification).sort()).toEqual([
      'AMOUNT_MISMATCH',
      'MATCHED',
      'PROVIDER_ONLY',
      'SYSTEM_ONLY',
    ]);
  });
  it('accepts BOM/CRLF and integer VND', () =>
    expect(
      parseDemoStatement('\uFEFFtransactionId,amount\r\nMOCK_1,123'),
    ).toEqual([{ transactionId: 'MOCK_1', amount: 123 }]));
  it.each([
    'bad,header\nx,1',
    'transactionId,amount\nx,1\nx,2',
    'transactionId,amount\n=HYPERLINK,1',
    'transactionId,amount\nx,1.2',
    'transactionId,amount\nx,-1',
    'transactionId,amount\nx,2147483648',
    'transactionId,amount\n',
  ])('rejects invalid or duplicated statement %s', (s) =>
    expect(() => parseDemoStatement(s)).toThrow(),
  );
});
describe('S40/S41 operational configuration', () => {
  it('uses explicit defaults, validates integer bounds', () => {
    expect(boundedConfig(undefined, 60, 1, 100)).toBe(60);
    expect(boundedConfig('1', 60, 1, 100)).toBe(1);
    for (const s of ['0', '-1', 'NaN', '1.5', '101'])
      expect(() => boundedConfig(s, 60, 1, 100)).toThrow();
  });
});
