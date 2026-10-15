import { HoldExpiryScheduler } from './hold-expiry.scheduler.js';
import type { HoldsService } from './holds.service.js';
import { metrics } from '../monitoring/metrics.js';

describe('S-43 worker instrumentation preserves cadence and recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.MONITORING_ENABLED;
    delete process.env.HOLD_EXPIRY_MODE;
  });
  it('collector throw never blocks next 60-second sweep or changes success', async () => {
    vi.useFakeTimers();
    process.env.MONITORING_ENABLED = 'true';
    process.env.HOLD_EXPIRY_MODE = 'worker';
    const sweep = vi.fn().mockResolvedValue(1);
    const unavailable = () => {
      throw Error('telemetry down');
    };
    vi.spyOn(metrics.cleaned, 'inc').mockImplementation(unavailable);
    vi.spyOn(metrics.workerLastSuccess, 'set').mockImplementation(unavailable);
    vi.spyOn(metrics.workerDuration, 'observe').mockImplementation(unavailable);
    const scheduler = new HoldExpiryScheduler({
      sweep,
    } as unknown as HoldsService);
    scheduler.onModuleInit();
    await vi.advanceTimersByTimeAsync(1);
    expect(sweep).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60000);
    expect(sweep).toHaveBeenCalledTimes(2);
    await scheduler.onModuleDestroy();
  });
  it('failed sweep retries next minute even if error metric throws', async () => {
    vi.useFakeTimers();
    process.env.MONITORING_ENABLED = 'true';
    process.env.HOLD_EXPIRY_MODE = 'worker';
    const sweep = vi
      .fn()
      .mockRejectedValueOnce(Error('DB unavailable'))
      .mockResolvedValue(0);
    vi.spyOn(metrics.workerErrors, 'inc').mockImplementation(() => {
      throw Error('telemetry down');
    });
    const scheduler = new HoldExpiryScheduler({
      sweep,
    } as unknown as HoldsService);
    scheduler.onModuleInit();
    await vi.advanceTimersByTimeAsync(60001);
    expect(sweep).toHaveBeenCalledTimes(2);
    await scheduler.onModuleDestroy();
  });
  it('off mode never runs a sweep', async () => {
    process.env.HOLD_EXPIRY_MODE = 'off';
    const sweep = vi.fn();
    const scheduler = new HoldExpiryScheduler({
      sweep,
    } as unknown as HoldsService);
    scheduler.onModuleInit();
    await scheduler.onModuleDestroy();
    expect(sweep).not.toHaveBeenCalled();
  });
});
