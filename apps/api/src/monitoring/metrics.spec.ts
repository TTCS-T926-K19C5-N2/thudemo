import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { Metrics } from './metrics.js';

describe('S-43 HTTP completion, privacy and business semantics', () => {
  beforeEach(() => {
    process.env.MONITORING_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.MONITORING_ENABLED;
  });
  function response(
    m: Metrics,
    status: number,
    path?: string,
    method = 'POST',
  ) {
    const req = {
      method,
      route: path ? { path } : undefined,
      originalUrl: '/secret-user?token=never-a-label',
      headers: { cookie: 'never-export' },
    } as unknown as Request;
    const res = Object.assign(new EventEmitter(), {
      statusCode: status,
      writableFinished: true,
      json: function (_body: unknown) {
        return this;
      },
    }) as unknown as Response;
    m.middleware(req, res, () => undefined);
    return res;
  }
  it('counts only completed responses, captures guard/validation/server errors and close once', async () => {
    const m = new Metrics();
    for (const status of [200, 400, 401, 403, 409, 500]) {
      const r = response(m, status, '/showtimes/:id/holds');
      r.emit('finish');
      r.emit('close');
    }
    const before = await m.requests.get();
    expect(before.values.reduce((n, v) => n + v.value, 0)).toBe(6);
    const unfinished = response(m, 200, '/showtimes/:id/holds');
    expect(
      (await m.requests.get()).values.reduce((n, v) => n + v.value, 0),
    ).toBe(6);
    Object.defineProperty(unfinished, 'writableFinished', { value: false });
    unfinished.emit('close');
    unfinished.emit('finish');
    expect(
      (await m.requests.get()).values.find(
        (v) => 'status' in v.labels && v.labels.status === '499',
      )?.value,
    ).toBe(1);
    expect(
      (await m.duration.get()).values
        .filter((v) => v.metricName?.endsWith('_count'))
        .reduce((n, v) => n + v.value, 0),
    ).toBe(7);
  });
  it('counts SEAT_CONFLICT requests once; ignores SHOWTIME_CLOSED and rejected seat count', async () => {
    const m = new Metrics();
    for (const code of ['SEAT_CONFLICT', 'SHOWTIME_CLOSED', 'HOLD_EXPIRED']) {
      const r = response(m, 409, '/showtimes/:id/holds');
      r.json({
        code,
        rejectedSeatIds: ['private-seat-id', 'another'],
        requestId: 'private-request',
      });
      r.emit('finish');
      r.emit('close');
    }
    expect((await m.conflicts.get()).values[0].value).toBe(1);
    const text = await m.registry.metrics();
    expect(text).not.toMatch(
      /private-seat|another|private-request|secret-user|never-export|token=/,
    );
  });
  it('bounds unknown routes/methods and excludes health traffic', async () => {
    const m = new Metrics();
    response(m, 404, undefined, 'UNBOUNDED-METHOD').emit('finish');
    response(m, 200, '/health').emit('finish');
    const v = (await m.requests.get()).values;
    expect(v).toHaveLength(1);
    expect(v[0].labels).toEqual({
      method: 'OTHER',
      route: '__unmatched__',
      status: '404',
    });
  });
  it('leaves webhook unavailable and rejects unbounded seam reasons', async () => {
    const m = new Metrics();
    expect((await m.webhookRejections.get()).values).toHaveLength(0);
    m.rejectWebhook('signature');
    m.rejectWebhook('attacker-controlled' as 'signature');
    expect((await m.webhookRejections.get()).values).toHaveLength(1);
    expect(
      (await m.producer.get()).values.find(
        (v) => v.labels.subsystem === 'webhook',
      )?.value,
    ).toBe(0);
  });
  it('fails open if exporter metrics fail and can disable instrumentation', () => {
    const m = new Metrics();
    const spy = vi.spyOn(m.requests, 'inc').mockImplementation(() => {
      throw Error('collector failure');
    });
    expect(() => response(m, 200, '/showtimes').emit('finish')).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
    process.env.MONITORING_ENABLED = 'false';
    response(m, 200, '/showtimes').emit('finish');
    expect(spy).toHaveBeenCalledOnce();
  });
});
