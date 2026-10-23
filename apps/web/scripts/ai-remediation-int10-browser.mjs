import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '../../..');
const runId = process.env.AI_REMEDIATION_RUN_ID;
assert.match(runId ?? '', /^\d{8}T\d{6}-remediation$/);
const cache = resolve(root, '.cache/ai-remediation', runId);
const evidence = resolve(root, 'evidence/ai-remediation', runId);
const fixture = JSON.parse(readFileSync(resolve(cache, 'r19-fixture.json'), 'utf8'));
assert.equal(fixture.runId, runId);
mkdirSync(evidence, { recursive: true });
const helper = resolve(root, 'apps/api/scripts/ai-remediation-profile.mjs');
function fixtureAction(operation) {
  const result = spawnSync(process.execPath, [helper, 'r19-fixture', operation], { cwd: root, env: process.env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Isolated fixture action ${operation} failed; inspect its run-bound log.`);
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
const report = { runId, environment: 'One Chromium context, same persistent IndexedDB across reloads, isolated PostgreSQL/API; role and active mutations scoped to synthetic fixture; no real provider or email.', stages: [], api: [], pageErrors: [], screenshots: [] };
await context.addCookies([{ name: 'event_session', value: fixture.token, url: 'http://127.0.0.1:3410', expires: Math.floor(Date.now()/1000)+4*60*60, httpOnly: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.on('pageerror', (error) => report.pageErrors.push(error.message));
page.on('response', (response) => { const url = new URL(response.url()); if (url.pathname === '/api/scanner/sync-scans' && response.request().method() === 'POST') report.api.push(response.status()); });
const readRows = () => page.evaluate((showtimeId) => new Promise((resolve, reject) => {
  const req = indexedDB.open('thudemo_scanner_db'); req.onerror = () => reject(req.error); req.onsuccess = () => { const db = req.result; const tx = db.transaction('durable_scans', 'readonly'); const get = tx.objectStore('durable_scans').index('showtimeId').getAll(showtimeId); tx.oncomplete = () => resolve(get.result.map((r) => ({ requestId: r.requestId, ticketId: r.ticketId, ticketCode: r.ticketCode, staffId: r.staffId, showtimeId: r.showtimeId, gateId: r.gateId, deviceId: r.deviceId, createdAt: r.createdAt, status: r.status, retryCount: r.retryCount, mode: r.mode }))); tx.onerror = () => reject(tx.error); };
}), fixture.showtimeId);
async function readyScanner() {
  await page.goto('http://127.0.0.1:3410/scanner/snapshot', { waitUntil: 'networkidle' });
  const enter = page.getByRole('button', { name: 'Vào máy quét suất này' }); await enter.waitFor({ state: 'visible', timeout: 10000 }); await enter.click();
  const download = page.getByRole('button', { name: /Tải (lại toàn bộ )?danh sách/ }); await download.waitFor({ state: 'visible', timeout: 10000 }); await download.click(); await page.getByText('Đã tải mới nhất', { exact: true }).waitFor({ timeout: 15000 });
  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  const assigned = page.getByRole('button', { name: 'Tải cửa được phân công' }); await assigned.waitFor({ state: 'visible', timeout: 15000 }); await assigned.click();
  const gate = page.getByLabel('Cửa hiện tại'); await gate.waitFor({ state: 'visible', timeout: 10000 }); await gate.selectOption(fixture.gateId);
  await page.waitForFunction(() => !document.querySelector('#ticket-code')?.disabled, { timeout: 12000 });
  await page.getByText('Giao diện đã sẵn sàng mở lại khi mất mạng.', { exact: true }).waitFor({ timeout: 35000 });
}
async function makeOfflineScan(ticketIndex) {
  const ticket = fixture.tickets[ticketIndex]; assert.ok(ticket?.qrPayload);
  await context.setOffline(true);
  await page.waitForFunction(() => document.querySelector('[data-testid="network-status"]')?.textContent?.includes('Ngoại tuyến'));
  await page.getByLabel('Hoặc nhập mã vé').fill(ticket.qrPayload);
  await page.getByRole('button', { name: 'Kiểm tra vé' }).click();
  await page.getByTestId('ticket-scan-status').filter({ hasText: 'Check-in thành công (ngoại tuyến)' }).waitFor({ timeout: 10000 });
  const rows = await readRows(); const row = rows.find((r) => r.ticketCode === ticket.ticketId && r.status === 'pending');
  assert.ok(row); assert.equal(row.staffId, fixture.userId); return { ticket, row };
}
async function postCurrentScan(scan) {
  return page.evaluate(async ({ fixture, scan }) => {
    const response = await fetch('/api/scanner/sync-scans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scans: [{ scanId: scan.requestId, showtimeId: scan.showtimeId, gateId: scan.gateId, ticketCode: scan.ticketCode, qrPayload: scan.ticketId, deviceId: scan.deviceId, scannedAt: scan.createdAt, deviceSentAt: new Date().toISOString(), mode: scan.mode ?? 'offline_admission' }] }) });
    return { status: response.status, body: await response.json() };
  }, { fixture: { showtimeId: fixture.showtimeId }, scan });
}
async function exercise(viewport, ticketIndex) {
  if (viewport === 'desktop') await page.setViewportSize({ width: 1440, height: 1000 });
  await readyScanner();
  const { ticket, row } = await makeOfflineScan(ticketIndex);
  const stage = { viewport, scanId: row.requestId, ticketId: ticket.ticketId };
  const apiCountBeforeRoleChange = report.api.length;
  fixtureAction('revoke-staff');
  await context.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const pendingAfterRole = (await readRows()).find((r) => r.requestId === row.requestId);
  assert.ok(pendingAfterRole && pendingAfterRole.status === 'pending' && pendingAfterRole.requestId === row.requestId);
  stage.roleSyncPosts = report.api.length - apiCountBeforeRoleChange;
  stage.pendingWhileUnauthorized = true;
  assert.equal(stage.roleSyncPosts, 0);
  stage.directRolePostStatus = (await postCurrentScan(row)).status;
  assert.equal(stage.directRolePostStatus, 403);
  await page.screenshot({ path: resolve(evidence, `int10-role-revoked-queue-${viewport}.png`), fullPage: true, animations: 'disabled' });
  report.screenshots.push(`int10-role-revoked-queue-${viewport}.png`);

  fixtureAction('disable-user');
  await page.reload({ waitUntil: 'domcontentloaded' });
  stage.directDisabledPostStatus = (await postCurrentScan(row)).status;
  assert.equal(stage.directDisabledPostStatus, 401);
  const pendingAfterDisabled = (await readRows()).find((r) => r.requestId === row.requestId);
  assert.ok(pendingAfterDisabled && pendingAfterDisabled.status === 'pending');
  stage.pendingWhileUnauthorized = stage.pendingWhileUnauthorized && true;
  await page.screenshot({ path: resolve(evidence, `int10-disabled-queue-${viewport}.png`), fullPage: true, animations: 'disabled' });
  report.screenshots.push(`int10-disabled-queue-${viewport}.png`);

  fixtureAction('enable-user'); fixtureAction('restore-staff');
  const syncResponse = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/scanner/sync-scans', { timeout: 15000 });
  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.onLine);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const response = await syncResponse;
  stage.finalSyncStatus = response.status();
  assert.equal(stage.finalSyncStatus, 200);
  await page.waitForFunction(async ({ showtimeId, requestId }) => {
    const req = indexedDB.open('thudemo_scanner_db'); const db = await new Promise((resolve,reject)=>{req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);});
    return await new Promise((resolve,reject)=>{const tx=db.transaction('durable_scans','readonly');const get=tx.objectStore('durable_scans').index('showtimeId').getAll(showtimeId);tx.oncomplete=()=>resolve(get.result.find((r)=>r.requestId===requestId)?.status==='synced');tx.onerror=()=>reject(tx.error);});
  }, { showtimeId: fixture.showtimeId, requestId: row.requestId }, { timeout: 10000 });
  await page.screenshot({ path: resolve(evidence, `int10-restored-sync-${viewport}.png`), fullPage: true, animations: 'disabled' });
  report.screenshots.push(`int10-restored-sync-${viewport}.png`);
  report.stages.push(stage);
}
try {
  await exercise('mobile', 0);
  await exercise('desktop', 1);
  assert.equal(report.pageErrors.length, 0);
  report.httpStatuses = report.api;
  writeFileSync(resolve(evidence, 'r19-int10-role-session-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('INT-10 actual role-revocation and account-disable browser/API recovery completed at mobile and desktop viewports.');
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(evidence, 'r19-int10-role-session-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally { await context.close(); await browser.close(); }
