// Diagnostic preload only; never imported by the product application.
// Record categories/durations, not SQL, bind values, cookies or session tokens.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { Session } from 'node:inspector/promises';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = new URL(process.env.DATABASE_URL ?? '');
assert(process.env.NODE_ENV === 'test' && process.env.HOLDS_PROFILE === '1');
assert(
  target.hostname === '127.0.0.1' &&
    ['15432', '15434'].includes(target.port) &&
    target.pathname === '/sang_holds_local',
);
assert(process.send, 'Profiling requires the isolated benchmark IPC parent');
const require = createRequire(import.meta.url);
const adapterRequire = createRequire(require.resolve('@prisma/adapter-pg'));
const { Pool, Client } = adapterRequire('pg');
let samples = {},
  pools = new Set();
let lastCpu = process.cpuUsage(),
  lastTime = performance.now(),
  lastElu = performance.eventLoopUtilization();
const lag = monitorEventLoopDelay({ resolution: 10 });
let cpuSession;
lag.enable();
const record = (kind, started) =>
  (samples[kind] ??= []).push(performance.now() - started);
function category(input) {
  const sql = typeof input === 'string' ? input : (input?.text ?? '');
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql))
    return sql.trim().split(/[;\s]/)[0].toUpperCase();
  if (sql.includes('WITH requested AS')) return 'hold-claim';
  if (sql.includes('FROM sessions s JOIN users u')) return 'auth';
  if (sql.includes('FROM (SELECT 1) anchor')) return 'hold-state';
  return 'other';
}
const connect = Pool.prototype.connect;
Pool.prototype.connect = function (...args) {
  pools.add(this);
  const started = performance.now();
  if (typeof args[0] === 'function') {
    const callback = args[0];
    args[0] = (...values) => {
      record('pool-acquire', started);
      callback(...values);
    };
    return connect.apply(this, args);
  }
  return connect
    .apply(this, args)
    .finally(() => record('pool-acquire', started));
};
const query = Client.prototype.query;
Client.prototype.query = function (...args) {
  const started = performance.now(),
    kind = category(args[0]);
  if (typeof args.at(-1) === 'function') {
    const callback = args.at(-1);
    args[args.length - 1] = (...values) => {
      record(kind, started);
      callback(...values);
    };
    return query.apply(this, args);
  }
  const result = query.apply(this, args);
  if (result?.finally) return result.finally(() => record(kind, started));
  result?.once('end', () => record(kind, started));
  return result;
};
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    p95: sorted[Math.ceil(values.length * 0.95) - 1],
    max: sorted.at(-1),
  };
};
process.on('message', async (message) => {
  if (message?.type !== 'holds-profile-snapshot') return;
  if (
    process.env.HOLDS_CPU_PROFILE === '1' &&
    message.label === 'before-bursts'
  ) {
    cpuSession = new Session();
    cpuSession.connect();
    await cpuSession.post('Profiler.enable');
    await cpuSession.post('Profiler.start');
  }
  const now = performance.now(),
    cpu = process.cpuUsage(),
    elu = performance.eventLoopUtilization();
  const result = {
    type: 'holds-profile-result',
    label: message.label,
    pid: process.pid,
    wallMs: now - lastTime,
    cpuMs: (cpu.user + cpu.system - lastCpu.user - lastCpu.system) / 1000,
    eventLoopUtilization: performance.eventLoopUtilization(elu, lastElu)
      .utilization,
    eventLoopDelayMs: { mean: lag.mean / 1e6, max: lag.max / 1e6 },
    pools: [...pools].map((pool) => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    })),
    operations: Object.fromEntries(
      Object.entries(samples).map(([kind, values]) => [kind, stats(values)]),
    ),
  };
  samples = {};
  lastCpu = cpu;
  lastTime = now;
  lastElu = elu;
  lag.reset();
  if (cpuSession && message.label === 'round-10') {
    const { profile } = await cpuSession.post('Profiler.stop');
    writeFileSync(
      resolve(
        import.meta.dirname,
        '../../..',
        process.env.HOLDS_EVIDENCE_DIR ?? 'evidence/holds/20261004',
        `api-${process.pid}.cpuprofile`,
      ),
      JSON.stringify(profile),
    );
    cpuSession.disconnect();
    cpuSession = undefined;
  }
  // Acknowledgement after flushing avoids the parent terminating this child
  // before the last CPU profile has been written.
  process.send(result);
});
