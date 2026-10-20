// Explicit, local-only promotion of the existing curated inventory. Never seeds.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = parseEnv(readFileSync(resolve(root, '.env'), 'utf8'));
const url = new URL(env.DATABASE_URL);
const origin = new URL(env.WEB_ORIGIN);
if (!['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.port !== '5432' || url.pathname !== '/codegym_local' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    env.PAYMENT_GATEWAY?.toLowerCase() !== 'mock' ||
    [env.NODE_ENV, env.APP_ENV].includes('production')) {
  throw Error('Only codegym_local on localhost:5432 with the mock gateway is allowed.');
}
const require = createRequire(resolve(root, 'apps/api/package.json'));
const { Client } = require(require.resolve('pg', { paths: [require.resolve('@prisma/adapter-pg')] }));
const db = new Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  const { rows } = await db.query(`SELECT s.id, s.status, s."isDemo", s."eventId",
    (SELECT COUNT(*)::int FROM seats x WHERE x."showtimeId"=s.id) AS seats,
    (SELECT COUNT(*)::int FROM seat_categories c WHERE c."showtimeId"=s.id AND (c.price IS NULL OR c.price<=0)) AS invalid_prices,
    e.status AS event_status, s."startTime"
    FROM showtimes s JOIN events e ON e.id=s."eventId" ORDER BY s.id`);
  if (rows.length !== 40 || new Set(rows.map(s => s.eventId)).size !== 40 ||
      rows.some(s => !s.seats || s.invalid_prices || s.event_status !== 'PUBLISHED' || new Date(s.startTime) <= new Date())) {
    throw Error('Expected exactly 40 published events with future schedules, seats and valid prices. No changes made.');
  }
  console.log(JSON.stringify({ showtimes: rows.length, seats: rows.reduce((n,s)=>n+s.seats,0), mockGateway: true }));
  if (!process.argv.includes('--apply')) {
    console.log('Inspection only. Use --apply for the explicitly authorized local booking configuration.');
  } else {
    const info = JSON.parse(execFileSync('docker', ['inspect', 'thudemo-postgres-1'], { encoding: 'utf8' }))[0];
    if (!info.NetworkSettings.Ports['5432/tcp']?.some(p => p.HostPort === '5432' && p.HostIp === '127.0.0.1'))
      throw Error('Backup container does not match localhost:5432.');
    const directory = resolve(root, '.cache/local-booking', new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'showtime-states.json'), JSON.stringify({ database: 'codegym_local', showtimes: rows }, null, 2));
    const dump = execFileSync('docker', ['exec', 'thudemo-postgres-1', 'pg_dump', '-U', decodeURIComponent(url.username), '-d', 'codegym_local', '-Fc'], { maxBuffer: 128 * 1024 * 1024 });
    if (dump.length < 10) throw Error('Database backup is empty.');
    writeFileSync(resolve(directory, 'database.dump'), dump);
    await db.query('BEGIN');
    const result = await db.query(`UPDATE showtimes SET status='ON_SALE', "isDemo"=false, "updatedAt"=now()
      WHERE id=ANY($1::uuid[]) AND status='DRAFT' AND "isDemo"=true RETURNING id`, [rows.map(s=>s.id)]);
    if (result.rowCount !== 40) throw Error('Inventory changed; rolling back instead of partially updating.');
    await db.query('UPDATE catalog_revision SET version=version+1 WHERE id=1');
    await db.query('COMMIT');
    console.log(JSON.stringify({ updated: result.rowCount, backup: directory, payment: 'mock', contentAndSeatsPreserved: true }));
  }
} catch (error) {
  await db.query('ROLLBACK').catch(()=>{});
  throw error;
} finally {
  await db.end();
}
