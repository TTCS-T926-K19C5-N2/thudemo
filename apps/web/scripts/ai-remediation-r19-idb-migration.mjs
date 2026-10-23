import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '../../..');
const runId = process.env.AI_REMEDIATION_RUN_ID;
assert.match(runId ?? '', /^\d{8}T\d{6}-remediation$/);
const evidence = resolve(root, 'evidence/ai-remediation', runId);
mkdirSync(evidence, { recursive: true });
const profile = resolve(root, '.cache/ai-remediation', runId, 'r19-idb-migration-profile-retry5');
const fixtureShowtime = JSON.parse(readFileSync(resolve(root, '.cache/ai-remediation', runId, 'r19-fixture.json'), 'utf8')).showtimeId;
const fixtureCode = '90000000-0000-4000-8000-000000000005';
const queuedId = '90000000-0000-4000-8000-000000000006';
const result = { runId, type: 'Chromium IndexedDB upgrade against current application bundle', beforeVersion: 3, expectedVersion: 4, assertions: {} };
let context;
try {
  context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1365, height: 900 }, serviceWorkers: 'block' });
  const page = context.pages()[0] ?? await context.newPage();
  const apiRequests = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  page.on('response', response => { if (response.url().includes('/api/')) apiRequests.push(response.status() + ' ' + response.url()); });
  await page.goto('http://127.0.0.1:3410/events', { waitUntil: 'domcontentloaded' });
  const seed = await page.evaluate(async ({ fixtureShowtime, fixtureCode, queuedId }) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('thudemo_scanner_db', 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('showtime_meta', { keyPath: 'showtimeId' });
        const tickets = db.createObjectStore('tickets', { keyPath: ['showtimeId', 'code'] });
        tickets.createIndex('showtimeId', 'showtimeId', { unique: false });
        tickets.createIndex('code', 'code', { unique: false });
        const scanQueue = db.createObjectStore('scan_queue', { keyPath: 'scanId' });
        scanQueue.createIndex('showtimeId', 'showtimeId', { unique: false });
        scanQueue.createIndex('ticketCode', 'ticketCode', { unique: false });
        scanQueue.createIndex('syncStatus', 'syncStatus', { unique: false });
        scanQueue.createIndex('showtime_ticket', ['showtimeId', 'ticketCode'], { unique: false });
        const pending = db.createObjectStore('pending_scans', { keyPath: 'id' });
        pending.createIndex('showtimeId', 'showtimeId', { unique: false });
        pending.createIndex('status', 'status', { unique: false });
        pending.createIndex('createdAt', 'createdAt', { unique: false });
        const durable = db.createObjectStore('durable_scans', { keyPath: 'id' });
        durable.createIndex('showtimeId', 'showtimeId', { unique: false });
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['showtime_meta', 'tickets', 'durable_scans'], 'readwrite');
        tx.objectStore('showtime_meta').put({ showtimeId: fixtureShowtime, showtimeName: 'Synthetic migration fixture', downloadedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString(), cursor: 'legacy-cursor', ticketCount: 1, keyId: 'test-key', publicKey: 'synthetic', status: 'ready' });
        tx.objectStore('tickets').put({ showtimeId: fixtureShowtime, code: fixtureCode, status: 'valid', checkedInAt: '2026-10-01T00:00:00Z', seatLabel: 'A-01', ticketType: 'VIP', holderName: 'Synthetic Holder', email: 'holder@fixture.invalid' });
        tx.objectStore('durable_scans').put({ id: queuedId, requestId: queuedId, showtimeId: fixtureShowtime, ticketCode: fixtureCode, ticketId: 'signed-qr-fixture', gateId: 'gate-test', createdAt: new Date().toISOString(), status: 'pending', retryCount: 0, mode: 'offline_admission' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    return { version: await new Promise((resolve, reject) => { const q=indexedDB.open('thudemo_scanner_db'); q.onsuccess=()=>{const v=q.result.version;q.result.close();resolve(v)};q.onerror=()=>reject(q.error); }) };
  }, { fixtureShowtime, fixtureCode, queuedId });
  assert.equal(seed.version, 3);
  // Scanner views keep live network channels open, so `networkidle` is not a
  // valid readiness condition. DOM readiness is enough to load scanner-db and
  // trigger the IndexedDB version upgrade.
  await page.goto('http://127.0.0.1:3410/scanner?showtimeId=' + fixtureShowtime, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(evidence, 'r19-idb-migration.png'), fullPage: true });
  const dbResult = await page.evaluate(async ({ fixtureShowtime, fixtureCode, queuedId }) => {
    const req = indexedDB.open('thudemo_scanner_db');
    const db = await new Promise((resolve, reject) => { req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
    const version=db.version;
    const tx=db.transaction(['tickets','durable_scans','showtime_meta'],'readonly');
    const ticketReq=tx.objectStore('tickets').get([fixtureShowtime,fixtureCode]);
    const queueReq=tx.objectStore('durable_scans').get(queuedId);
    const metaReq=tx.objectStore('showtime_meta').get(fixtureShowtime);
    return await new Promise((resolve,reject)=>{tx.oncomplete=()=>{db.close();resolve({version,ticket:ticketReq.result,queue:queueReq.result,meta:metaReq.result})};tx.onerror=()=>reject(tx.error)});
  }, { fixtureShowtime, fixtureCode, queuedId });
  result.assertions.version = dbResult.version === 4;
  result.assertions.ticketKeys = Object.keys(dbResult.ticket ?? {}).sort();
  result.assertions.ticketSanitized = JSON.stringify(dbResult.ticket) === JSON.stringify({ showtimeId: fixtureShowtime, code: fixtureCode, status: 'valid' });
  result.assertions.pendingQueuePreserved = dbResult.queue?.id === queuedId && dbResult.queue.status === 'pending';
  result.assertions.showtimeMetadataPreserved = dbResult.meta?.cursor === 'legacy-cursor';
  result.screenshot = 'r19-idb-migration.png';
  await page.screenshot({ path: resolve(evidence, result.screenshot), fullPage: true });
  assert.equal(result.assertions.version, true);
  assert.equal(result.assertions.ticketSanitized, true);
  assert.equal(result.assertions.pendingQueuePreserved, true);
  assert.equal(result.assertions.showtimeMetadataPreserved, true);
  writeFileSync(resolve(evidence, 'r19-idb-migration.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} catch (error) {
  result.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(evidence, 'r19-idb-migration.json'), JSON.stringify(result, null, 2) + '\n');
  throw error;
} finally { await context?.close(); }
