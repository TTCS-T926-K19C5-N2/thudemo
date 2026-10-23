import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const stateDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const state = JSON.parse(readFileSync(resolve(stateDir, 'profile.json'), 'utf8'));
const fixture = JSON.parse(readFileSync(resolve(stateDir, 's63-fixture.json'), 'utf8'));
const ui = JSON.parse(readFileSync(resolve(evidenceDir, 's63-browser.json'), 'utf8'));
if (state.run_id !== runId || fixture.runId !== runId || ui.runId !== runId) throw new Error('Run-bound evidence mismatch');
const privateEnv = Object.fromEntries(readFileSync(resolve(stateDir, 'compose.env'), 'utf8').trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
const connectionString = `postgresql://remediation:${encodeURIComponent(privateEnv.AI_REMEDIATION_DB_PASSWORD)}@127.0.0.1:${state.db.port}/codegym_remediation`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 3 }) });
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};
const summary = (values) => values.length ? { meanSeconds: values.reduce((a, b) => a + b, 0) / values.length, p90Seconds: percentile(values, 0.9) } : { meanSeconds: null, p90Seconds: null };
try {
  const sessions = await db.$queryRaw`
    SELECT hs.id, hs."createdAt" AS started_at,
      o."createdAt" AS order_at,
      (SELECT min(a."createdAt") FROM domain_audit a WHERE a."entityType"='orders'
        AND a."entityId"=o.id AND a."afterState"->>'status'='PAID'
        AND a."createdAt"<=${new Date(ui.apiResponse.to)}) AS paid_at,
      count(DISTINCT sh."seatId")::integer AS seat_count
    FROM hold_sessions hs
    LEFT JOIN LATERAL (SELECT x.id,x."createdAt" FROM orders x WHERE x."holdSessionId"=hs.id ORDER BY x."createdAt",x.id LIMIT 1) o ON true
    LEFT JOIN seat_holds sh ON sh."holdSessionId"=hs.id
    WHERE hs.id IN (${fixture.sessionIds[0]}::uuid,${fixture.sessionIds[1]}::uuid,${fixture.sessionIds[2]}::uuid,${fixture.sessionIds[3]}::uuid,${fixture.sessionIds[4]}::uuid,${fixture.sessionIds[5]}::uuid,${fixture.sessionIds[6]}::uuid,${fixture.sessionIds[7]}::uuid,${fixture.sessionIds[8]}::uuid,${fixture.sessionIds[9]}::uuid)
    GROUP BY hs.id,hs."createdAt",o.id,o."createdAt"`;
  const orderDurations = sessions.filter((s) => s.order_at && s.order_at <= new Date(ui.apiResponse.to)).map((s) => (s.order_at - s.started_at) / 1000);
  const paidDurations = sessions.filter((s) => s.paid_at).map((s) => (s.paid_at - s.started_at) / 1000);
  const expected = { startedSessions: sessions.length, orderCreatedSessions: orderDurations.length, paidSessions: paidDurations.length, holdToOrder: summary(orderDurations), holdToPaid: summary(paidDurations), distinctSeatMultiplicity: Math.max(...sessions.map((s) => s.seat_count)) };
  assert.equal(expected.startedSessions, ui.apiResponse.startedSessions);
  assert.equal(expected.orderCreatedSessions, ui.apiResponse.orderCreatedSessions);
  assert.equal(expected.paidSessions, ui.apiResponse.paidSessions);
  for (const metric of ['holdToOrder', 'holdToPaid']) for (const key of ['meanSeconds', 'p90Seconds']) {
    const actual = ui.apiResponse[metric][key];
    const oracle = expected[metric][key];
    assert.ok(actual === null && oracle === null || Math.abs(actual - oracle) < 0.001, `${metric}.${key}: API=${actual}, SQL oracle=${oracle}`);
  }
  assert.equal(expected.distinctSeatMultiplicity, 2, 'fixture includes one multi-seat hold session');
  const output = { runId, evidenceSource: 'isolated PostgreSQL raw rows, independently aggregated in harness', sampleCount: sessions.length, oracle: expected, api: ui.apiResponse, matched: true };
  const { writeFileSync } = await import('node:fs');
  writeFileSync(resolve(evidenceDir, 's63-independent-oracle.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ runId, sampleCount: sessions.length, matched: true, maximumSeatsInOneSession: expected.distinctSeatMultiplicity }));
} finally { await db.$disconnect(); }
