import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const preload = pathToFileURL(
  resolve(import.meta.dirname, 'profile-holds-preload.mjs'),
).href;
const cwd = resolve(import.meta.dirname, '..');
const env = {
  ...process.env,
  NODE_ENV: 'test',
  HOLDS_PROFILE: '1',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:15434/sang_holds_local',
};

test(
  'profile aggregates callback/promise operations and never sends query text or parameters',
  { timeout: 5000 },
  async () => {
    // Stub the driver before loading the instrumentation: no DB/network connection.
    const code = `
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const { Pool, Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
    Pool.prototype.connect = function(callback) {
      if (callback) { queueMicrotask(() => callback(null, {}, () => {})); return; }
      return Promise.resolve({});
    };
    Client.prototype.query = function(...args) {
      const callback = args.at(-1);
      if (typeof callback === 'function') { queueMicrotask(() => callback(null, {rows: []})); return; }
      return Promise.resolve({rows: []});
    };
    await import(${JSON.stringify(preload)});
    const pool = new Pool(), client = new Client();
    await pool.connect();
    await new Promise((resolve) => pool.connect(() => resolve()));
    await client.query('SELECT secret_sql_canary FROM sessions s JOIN users u', ['private_bind_canary']);
    await new Promise((resolve) => client.query('SELECT secret_sql_canary FROM sessions s JOIN users u', ['private_bind_canary'], () => resolve()));
    await client.query({text: 'WITH requested AS (SELECT secret_sql_canary)', values: ['private_bind_canary']});
    await client.query("BEGIN; SET LOCAL statement_timeout = '10000ms'");
    process.send({type: 'ready'});
  `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    try {
      const result = await new Promise((resolveResult, reject) => {
        child.on('error', reject);
        child.on('exit', () =>
          reject(Error(stderr || 'Profiler exited before reply')),
        );
        child.on('message', (message) => {
          if (message.type === 'ready')
            child.send({ type: 'holds-profile-snapshot', label: 'test-round' });
          if (message.type === 'holds-profile-result') resolveResult(message);
        });
      });
      assert.equal(result.operations['pool-acquire'].count, 2);
      assert.equal(result.operations.auth.count, 2);
      assert.equal(result.operations['hold-claim'].count, 1);
      assert.equal(result.operations.BEGIN.count, 1);
      assert.equal(result.label, 'test-round');
      assert(result.cpuMs >= 0 && result.wallMs >= 0);
      assert(!JSON.stringify(result).includes('secret_sql_canary'));
      assert(!JSON.stringify(result).includes('private_bind_canary'));
    } finally {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
  },
);

test(
  'profile refuses a non-test environment or a non-isolated DB before doing any work',
  { timeout: 5000 },
  async () => {
    for (const override of [
      { NODE_ENV: 'production' },
      { DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:5432/demo' },
    ]) {
      const child = spawn(
        process.execPath,
        ['--import', preload, '-e', 'process.exit(0)'],
        {
          cwd,
          env: { ...env, ...override },
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        },
      );
      let stderr = '';
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      const [exitCode] = await once(child, 'exit');
      assert.notEqual(exitCode, 0);
      assert.match(stderr, /AssertionError/);
    }
  },
);

test(
  'CPU profile is flushed before the final IPC acknowledgement',
  { timeout: 5000 },
  async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'holds-profile-test-'));
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(preload)}); process.send({type: 'ready'});`,
      ],
      {
        cwd,
        env: { ...env, HOLDS_CPU_PROFILE: '1', HOLDS_EVIDENCE_DIR: scratch },
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    );
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    const profilePath = join(scratch, `api-${child.pid}.cpuprofile`);
    try {
      await new Promise((resolveResult, reject) => {
        child.on('error', reject);
        child.on('exit', () =>
          reject(Error(stderr || 'Profiler exited before reply')),
        );
        child.on('message', (message) => {
          if (message.type === 'ready')
            child.send({
              type: 'holds-profile-snapshot',
              label: 'before-bursts',
            });
          if (message.type !== 'holds-profile-result') return;
          if (message.label === 'before-bursts')
            child.send({ type: 'holds-profile-snapshot', label: 'round-10' });
          if (message.label === 'round-10') resolveResult();
        });
      });
      const profile = JSON.parse(await readFile(profilePath, 'utf8'));
      assert(Array.isArray(profile.nodes) && profile.nodes.length > 0);
      assert(profile.endTime >= profile.startTime);
    } finally {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
      // Only our single generated file and empty, mkdtemp-created directory.
      await unlink(profilePath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
      await rmdir(scratch);
    }
  },
);
