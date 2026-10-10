import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { connect, admit } from './s31-db-client.mjs';

const checks = [];
const samples = [];
const showtime = randomUUID();
const staffA = randomUUID();
const staffB = randomUUID();
const client = await connect();
const children = [];
const candidateUrl = new URL(
  '../prisma/verification/s31-admission-candidate.sql',
  import.meta.url,
);
const sql = await readFile(candidateUrl, 'utf8');

async function check(name, fn) {
  await fn();
  checks.push({ name, result: 'PASS' });
  console.log(`PASS ${name}`);
}

async function ticket(status = 'VALID') {
  const id = randomUUID();
  await client.query(
    'INSERT INTO s31_verification.tickets VALUES ($1, $2, $3)',
    [id, showtime, status],
  );
  return id;
}

function input(id, overrides = {}) {
  return {
    ticket: id,
    showtime,
    gate: 'A',
    actor: staffA,
    name: 'Nhân viên thử A',
    request: randomUUID(),
    ...overrides,
  };
}

async function count(id) {
  const result = await client.query(
    'SELECT count(*)::int AS count FROM s31_verification.admissions WHERE ticket_id = $1',
    [id],
  );
  return result.rows[0].count;
}

async function worker() {
  const child = fork(
    fileURLToPath(new URL('./s31-db-worker.mjs', import.meta.url)),
    [],
    { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
  );
  children.push(child);
  await message(child);
  return child;
}

function message(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error('Database worker timeout')),
      15000,
    );
    const done = (value) =>
      finish(value.error ? new Error(value.error) : null, value);
    const died = (code) => finish(new Error(`Database worker exited ${code}`));
    function finish(error, value) {
      clearTimeout(timer);
      child.off('message', done);
      child.off('exit', died);
      child.off('error', finish);
      if (error) reject(error);
      else resolve(value);
    }
    child.once('message', done);
    child.once('exit', died);
    child.once('error', finish);
  });
}

async function scan(child, value) {
  const response = message(child);
  child.send(value);
  return (await response).result;
}

try {
  const existing = await client.query(
    "SELECT to_regnamespace('s31_verification') AS schema",
  );
  assert.equal(
    existing.rows[0].schema,
    null,
    'Use a fresh dedicated database; existing proof data is preserved',
  );
  const migrations = await client.query(
    'SELECT count(*)::int AS count FROM public._prisma_migrations WHERE finished_at IS NOT NULL',
  );
  assert.ok(
    migrations.rows[0].count > 0,
    'Apply real repository migrations first',
  );
  await client.query(sql);
  const a = await worker();
  const b = await worker();
  assert.notEqual(a.pid, b.pid);

  await check(
    'first entry records trusted-input actor, gate and database time',
    async () => {
      const id = await ticket();
      const start = Date.now();
      const result = await scan(a, input(id));
      assert.equal(result.code, 'ADMITTED');
      const row = (
        await client.query(
          'SELECT * FROM s31_verification.admissions WHERE ticket_id=$1',
          [id],
        )
      ).rows[0];
      assert.equal(row.actor_id, staffA);
      assert.equal(row.actor_name, 'Nhân viên thử A');
      assert.equal(row.gate_id, 'A');
      assert.ok(row.entered_at.getTime() >= start - 1000);
      assert.ok(row.entered_at.getTime() <= Date.now() + 1000);
      assert.equal(await count(id), 1);
    },
  );

  await check(
    'repeat at B returns original 19:02 at A without overwriting',
    async () => {
      const id = await ticket();
      await client.query(
        "INSERT INTO s31_verification.admissions(ticket_id,actor_id,actor_name,request_id,showtime_id,gate_id,kind,entered_at) VALUES($1,$2,'Fixture',$3,$4,'A','NORMAL','2026-10-08T12:02:00Z')",
        [id, staffA, randomUUID(), showtime],
      );
      const result = await scan(
        b,
        input(id, { actor: staffB, name: 'Nhân viên thử B', gate: 'B' }),
      );
      assert.equal(result.code, 'TICKET_ALREADY_USED');
      assert.equal(result.first_entered_at, '2026-10-08T12:02:00.000Z');
      assert.equal(result.first_gate, 'A');
      assert.equal(await count(id), 1);
    },
  );

  await check(
    '50 races through two OS processes and PostgreSQL connections: exactly one admission per ticket',
    async () => {
      for (let i = 0; i < 50; i++) {
        const id = await ticket();
        const start = performance.now();
        const results = await Promise.all([
          scan(a, input(id)),
          scan(
            b,
            input(id, { actor: staffB, name: 'Nhân viên thử B', gate: 'B' }),
          ),
        ]);
        samples.push(performance.now() - start);
        assert.deepEqual(results.map((r) => r.code).sort(), [
          'ADMITTED',
          'TICKET_ALREADY_USED',
        ]);
        assert.equal(await count(id), 1);
        assert.equal(results[0].admission_id, results[1].admission_id);
        assert.equal(results[0].first_gate, results[1].first_gate);
        assert.equal(results[0].first_entered_at, results[1].first_entered_at);
      }
    },
  );

  await check(
    'concurrent retry returns ALREADY_RECORDED rather than another ADMITTED',
    async () => {
      const id = await ticket();
      const value = input(id);
      const results = await Promise.all([scan(a, value), scan(b, value)]);
      assert.deepEqual(results.map((r) => r.code).sort(), [
        'ADMITTED',
        'ALREADY_RECORDED',
      ]);
      assert.equal(await count(id), 1);
      const replay = await scan(a, value);
      assert.equal(replay.code, 'ALREADY_RECORDED');
      assert.equal(replay.admission_id, results[0].admission_id);
      const conflict = await scan(b, { ...value, gate: 'B' });
      assert.equal(conflict.code, 'REQUEST_CONFLICT');
      assert.equal(conflict.first_entered_at, null);
      assert.equal(conflict.first_gate, null);
    },
  );

  await check(
    'concurrent request key reuse for different tickets maps to REQUEST_CONFLICT',
    async () => {
      const first = await ticket();
      const second = await ticket();
      const key = randomUUID();
      const results = await Promise.all([
        scan(a, input(first, { request: key })),
        scan(b, input(second, { request: key })),
      ]);
      assert.deepEqual(results.map((r) => r.code).sort(), [
        'ADMITTED',
        'REQUEST_CONFLICT',
      ]);
      assert.equal((await count(first)) + (await count(second)), 1);
    },
  );

  await check(
    'restart a database worker preserves ticket used state',
    async () => {
      const id = await ticket();
      await scan(a, input(id));
      a.disconnect();
      await new Promise((resolve) => a.once('exit', resolve));
      const restarted = await worker();
      assert.notEqual(restarted.pid, a.pid);
      assert.equal(
        (await scan(restarted, input(id, { actor: staffB, gate: 'B' }))).code,
        'TICKET_ALREADY_USED',
      );
      assert.equal(await count(id), 1);
    },
  );

  await check(
    'missing, cancelled and wrong-show tickets return no entry metadata',
    async () => {
      const valid = await ticket();
      await scan(b, input(valid));
      const invalid = [
        input(randomUUID()),
        input(await ticket('CANCELLED')),
        input(valid, { showtime: randomUUID() }),
      ];
      for (const value of invalid) {
        const result = await scan(b, value);
        assert.equal(result.code, 'TICKET_NOT_ELIGIBLE');
        assert.equal(result.first_entered_at, null);
        assert.equal(result.first_gate, null);
        assert.equal(result.admission_id, null);
      }
    },
  );

  await check(
    'partial unique index rejects a second direct NORMAL insert',
    async () => {
      const id = await ticket();
      await scan(b, input(id));
      await assert.rejects(
        client.query(
          "INSERT INTO s31_verification.admissions(ticket_id,actor_id,actor_name,request_id,showtime_id,gate_id,kind) VALUES($1,$2,'Fixture',$3,$4,'B','NORMAL')",
          [id, staffB, randomUUID(), showtime],
        ),
        { code: '23505' },
      );
      assert.equal(await count(id), 1);
    },
  );

  await check(
    'transaction rollback leaves no used state or admission',
    async () => {
      const id = await ticket();
      await client.query('BEGIN');
      assert.equal((await admit(client, input(id))).code, 'ADMITTED');
      await assert.rejects(client.query('SELECT 1/0'), { code: '22012' });
      await client.query('ROLLBACK');
      assert.equal(await count(id), 0);
      assert.equal((await scan(b, input(id))).code, 'ADMITTED');
    },
  );

  await check(
    'exception ledger reason constraint rejects blank, whitespace and over-limit values',
    async () => {
      const id = await ticket();
      for (const reason of [null, '', '   ', '\t\n', 'x'.repeat(501)]) {
        await assert.rejects(
          client.query(
            "INSERT INTO s31_verification.admissions(ticket_id,actor_id,actor_name,request_id,showtime_id,gate_id,kind,reason) VALUES($1,$2,'Fixture',$3,$4,'B','EXCEPTION',$5)",
            [id, staffB, randomUUID(), showtime, reason],
          ),
          { code: '23514' },
        );
      }
      assert.equal(await count(id), 0);
    },
  );

  await check(
    'direct exception fixture keeps first entry and does not reopen ordinary admission',
    async () => {
      const id = await ticket();
      const first = await scan(b, input(id));
      const key = randomUUID();
      await client.query(
        "INSERT INTO s31_verification.admissions(ticket_id,actor_id,actor_name,request_id,showtime_id,gate_id,kind,reason) VALUES($1,$2,'Nhân viên thử B',$3,$4,'B','EXCEPTION','Lý do thử nghiệm')",
        [id, staffB, key, showtime],
      );
      await assert.rejects(
        client.query(
          "INSERT INTO s31_verification.admissions(ticket_id,actor_id,actor_name,request_id,showtime_id,gate_id,kind,reason) VALUES($1,$2,'Fixture',$3,$4,'B','EXCEPTION','Lý do thử nghiệm')",
          [id, staffB, key, showtime],
        ),
        { code: '23505' },
      );
      const next = await scan(b, input(id, { gate: 'B' }));
      assert.equal(next.code, 'TICKET_ALREADY_USED');
      assert.equal(next.admission_id, first.admission_id);
      assert.equal(next.first_gate, 'A');
      assert.equal(await count(id), 2);
    },
  );

  const ordered = samples.toSorted((x, y) => x - y);
  const evidence = {
    date: new Date().toISOString(),
    scope:
      'candidate PostgreSQL storage proof; NOT S-30 API, sessions, QR, RBAC, browser or AC acceptance',
    sourceSha256: createHash('sha256').update(sql).digest('hex'),
    realRepositoryMigrationsApplied: migrations.rows[0].count,
    raceRounds: samples.length,
    processes: 'two separate Node workers; separate PostgreSQL connections',
    candidateRaceRoundP95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
    checks,
    pending: [
      'S-30 API/QR/session/scoped authorization integration',
      'PO exception permission and scope',
      'authorized exception endpoint',
      'two API instances and API restart',
      'V1 desktop/mobile/browser/real camera',
      'staging and S-30 latency NFR',
    ],
  };
  const directory = new URL('../../../evidence/s31/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('storage-proof.json', directory),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(
    `Storage proof: ${checks.length} checks passed; story acceptance remains BLOCKED`,
  );
} finally {
  for (const child of children) if (child.connected) child.disconnect();
  await client.end();
}
