import { describe, it, expect } from 'vitest';
import { localAlertCodes } from './local-dashboard.js';
describe('S43 in-app threshold alerts', () => {
  it('does not label no data as latency measurement', () =>
    expect(
      localAlertCodes({
        requests: 0,
        errorRatePercent: 0,
        holdConflicts: 0,
        webhookRejected: 0,
        p95Ms: null,
      }),
    ).toEqual([]));
  it('fires4separate operational reasons at documented thresholds', () =>
    expect(
      localAlertCodes({
        requests: 10,
        errorRatePercent: 5,
        holdConflicts: 10,
        webhookRejected: 1,
        p95Ms: 1000,
      }),
    ).toEqual([
      'HIGH_ERROR_RATE',
      'HIGH_P95_LATENCY',
      'HOLD_CONFLICT_BURST',
      'REJECTED_WEBHOOK',
    ]));
  it('requires minimum sample for error-rate alert and clears when below thresholds', () =>
    expect(
      localAlertCodes({
        requests: 9,
        errorRatePercent: 100,
        holdConflicts: 9,
        webhookRejected: 0,
        p95Ms: 999,
      }),
    ).toEqual([]));
});
