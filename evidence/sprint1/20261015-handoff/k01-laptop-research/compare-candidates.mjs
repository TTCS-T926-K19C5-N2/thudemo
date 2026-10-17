import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { postgresCandidate, redisCandidate } from './candidate-stores.mjs';
process.env.K01_NAMESPACE = `k01_${randomUUID().replaceAll('-', '')}`;
const path = resolve("D:/Development/03_Academic/Bán vé sự kiện có sơ đồ ghế/thudemo-sprint1-gitflow-20261015/evidence/sprint1/20261015-handoff/k01-laptop-research");
mkdirSync(path, { recursive: true });
const result = {
  runId: process.env.K01_NAMESPACE,
  date: new Date().toISOString(),
  runtime: process.version,
  machine: {
    cpu: cpus()[0].model,
    threads: cpus().length,
    ramBytes: totalmem(),
  },
  mode: 'Laptop staging research: two loopback HTTP processes, dedicated PostgreSQL15/Redis7-AOF-everysec persistent profiles, pool8/process; co-located generator, not product API/CI/T31/public-LAN measurement',
  stores: [],
  failures: [],
  staging: false, stagingResearchProfile: true, // Research HTTP only, not the deployed product endpoint.
  approved: false,
};
const percentile = (a, p) =>
  [...a].sort((x, y) => x - y)[Math.ceil(a.length * p) - 1];
const stats = (a) => ({
  n: a.length,
  p50: percentile(a, 0.5),
  p95: percentile(a, 0.95),
  p99: percentile(a, 0.99),
});
async function start(store) {
  const child = fork(new URL('./candidate-server.mjs', import.meta.url), [], {
    env: { ...process.env, K01_STORE: store },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('message', (m) => resolve(m.port));
    child.once('exit', () => reject(new Error('Candidate startup failed')));
  });
  return { child, port };
}
async function stop(server) {
  await new Promise((resolve) => {
    server.child.once('exit', resolve);
    server.child.send('shutdown');
  });
}
async function post(port, actor, seats) {
  const begin = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}/candidate/hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor, seats }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  return { status: response.status, ms: performance.now() - begin, body };
}
for (const name of ['PostgreSQL', 'Redis']) {
  const store = name === 'PostgreSQL' ? postgresCandidate() : redisCandidate();
  const entry = { name, rounds: [], checks: [], raw: [] };
  let servers = [];
  try {
    if (name === 'PostgreSQL') await store.setup();
    servers = await Promise.all([start(name), start(name)]);
    for (let round = 0; round < 3; round++) {
      const rows = await Promise.all(
        Array.from({ length: 200 }, (_, i) =>
          post(servers[i % 2].port, `fixture-r${round}-${i}`, [round + 1]),
        ),
      );
      assert.equal(rows.filter((r) => r.status === 200).length, 1);
      assert.equal(rows.filter((r) => r.status === 409).length, 199);
      assert.equal((await store.active(round + 1)).length, 1);
      const all = stats(rows.map((r) => r.ms));
      entry.rounds.push({
        round,
        winners: 1,
        conflicts: 199,
        errors: 0,
        all,
        success: stats(rows.filter((r) => r.status === 200).map((r) => r.ms)),
        conflict: stats(rows.filter((r) => r.status === 409).map((r) => r.ms)),
      });
      entry.raw.push(rows.map(({ status, ms }) => ({ status, ms })));
    }
    const overlaps = await Promise.all([
      post(servers[0].port, 'fixture-overlap-a', [101, 102]),
      post(servers[1].port, 'fixture-overlap-b', [102, 103]),
    ]);
    assert.deepEqual(overlaps.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (await store.active()).filter((r) => r.seat >= 101 && r.seat <= 103)
        .length,
      2,
    );
    entry.checks.push('Overlapping sets all-or-none across two processes');
    const first = await post(servers[0].port, 'fixture-session', [201]);
    const add = await post(servers[1].port, 'fixture-session', [202]);
    assert.equal(first.body.expiresAt, add.body.expiresAt);
    assert.equal(first.body.token, add.body.token);
    assert.ok(
      Math.abs(
        Date.parse(first.body.expiresAt) -
          Date.parse(first.body.serverTime) -
          600000,
      ) < 1000,
    );
    entry.checks.push(
      'Server clock 10-minute deadline; adding seats does not extend',
    );
    const same = await Promise.all([
      post(servers[0].port, 'fixture-concurrent-session', [203]),
      post(servers[1].port, 'fixture-concurrent-session', [204]),
    ]);
    assert.equal(same[0].body.expiresAt, same[1].body.expiresAt);
    assert.equal(same[0].body.token, same[1].body.token);
    entry.checks.push('Concurrent session requests have one deadline/token');
    const retry = await post(servers[1].port, 'fixture-session', [201, 202]);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.expiresAt, first.body.expiresAt);
    entry.checks.push('Lost-response retry does not extend or duplicate');
    await store.expire('fixture-session');
    assert.equal((await store.active(201)).length, 0);
    const reused = await post(servers[0].port, 'fixture-new-owner', [201]);
    assert.equal(reused.status, 200);
    await store.staleCleanup(201, first.body.token);
    assert.equal((await store.active(201))[0].actor, 'fixture-new-owner');
    entry.checks.push(
      'Expired claims free without worker; stale token cannot remove new owner',
    );
    await store.cleanup();
    await store.cleanup();
    assert.equal((await store.active(201)).length, 1);
    entry.checks.push('Repeated cleanup retains active owner');
    await assert.rejects(store.hold('fixture-failure', [301, 302], true));
    assert.equal((await store.active(301)).length, 0);
    assert.equal((await store.active(302)).length, 0);
    entry.checks.push('Injected transaction failure leaves no partial claims');
    const ahead = await post(servers[0].port, 'fixture-process-restart', [401]);
    await stop(servers[0]);
    servers[0] = await start(name);
    assert.equal(
      (await post(servers[0].port, 'fixture-process-restart', [401])).body
        .token,
      ahead.body.token,
    );
    entry.checks.push(
      'API candidate process restart retains datastore owner/deadline',
    );
    const docker = process.env.K01_DOCKER_EXE;
    if (!docker)
      throw new Error(
        'Docker executable required for isolated restart verification',
      );
    await Promise.all(servers.map(stop));
    servers = [];
    await store.close();
    execFileSync(
      docker,
      [
        'restart',
        name === 'PostgreSQL'
          ? 'sprint1-k01-stage-pg-20261015'
          : 'sprint1-k01-stage-redis-20261015',
      ],
      { stdio: 'ignore' },
    );
    const recovered =
      name === 'PostgreSQL' ? postgresCandidate() : redisCandidate();
    try {
      let rows;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          rows = await recovered.active(401);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      assert.ok(rows);
      const retains = rows.length === 1;
      assert.equal(retains, true); // Both stores use persistent volumes; Redis AOF enabled in this experiment.
      entry.restart = {
        ownerRetained: retains,
        reason:
          name === 'PostgreSQL'
            ? 'Committed ownership survives container restart'
            : 'Redis AOF everysec retains confirmed owner after GRACEFUL container restart; hard crash not tested',
      };
      if (name === 'PostgreSQL') await recovered.drop();
      else await recovered.drop();
    } finally {
      await recovered.close();
    }
    entry.futureOrderBoundary =
      name === 'PostgreSQL'
        ? 'Ownership and future order/seat transition can share one database transaction; requires future shared lock order, not implemented orders'
        : 'Redis Lua ownership with AOF retained after graceful restart; cannot join PostgreSQL order transaction; hard-crash fsync window not tested';
  } catch (error) {
    result.failures.push({ store: name, message: error.message });
    process.exitCode = 1;
  } finally {
    for (const server of servers) await stop(server);
    try {
      await store.close();
    } catch {}
    result.stores.push(entry);
  }
}
result.recommendation =
  'PostgreSQL remains temporary LOCAL authority per DEC12; Redis AOF graceful restart retention does not solve cross-store order transaction consistency. Stage architecture/human review and endpoint NFR remain separate gates.';
writeFileSync(
  resolve(path, 'k01-candidates.json'),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      stores: result.stores.map((s) => ({
        name: s.name,
        rounds: s.rounds,
        checks: s.checks,
        restart: s.restart,
      })),
      failures: result.failures,
      staging: false,
      approved: false,
    },
    null,
    2,
  ),
);
