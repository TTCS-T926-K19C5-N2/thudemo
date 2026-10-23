import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '../../..');
const runId = process.env.AI_REMEDIATION_RUN_ID;
assert.match(runId ?? '', /^\d{8}T\d{6}-remediation$/);
const cacheDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const fixture = JSON.parse(readFileSync(resolve(cacheDir, 'r19-fixture.json'), 'utf8'));
assert.equal(fixture.runId, runId);
mkdirSync(evidenceDir, { recursive: true });
const profileDir = resolve(cacheDir, 'r19-delta-browser-profile');
const report = { runId, environment: 'Authenticated Chromium against isolated local API/PostgreSQL; no 4G/provider.', checks: [], api: [], pageErrors: [], screenshots: [] };
let context;
try {
  context = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'allow' });
  await context.addCookies([{ name: 'event_session', value: fixture.token, url: 'http://127.0.0.1:3410', expires: Math.floor(Date.now() / 1000) + 4 * 60 * 60, httpOnly: true, sameSite: 'Lax' }]);
  const page = context.pages()[0] ?? await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes('/scanner/showtimes/') && url.pathname.endsWith('/tickets')) report.api.push({ method: response.request().method(), path: url.pathname, hasCursor: url.searchParams.has('since'), status: response.status() });
  });
  await page.goto('http://127.0.0.1:3410/scanner/snapshot', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Vào máy quét suất này' }).click();
  const fullResponse = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/tickets') && !new URL(response.url()).searchParams.has('since'), { timeout: 20000 });
  await page.getByRole('button', { name: /^Tải danh sách$/ }).click();
  await page.getByText('Đã tải mới nhất', { exact: true }).waitFor({ timeout: 20000 });
  const full = await fullResponse;
  const fullBody = await full.json();
  report.fullSnapshot = { status: full.status(), mode: fullBody.mode, totalTickets: fullBody.totalTickets, cursor: fullBody.cursor };
  assert.equal(full.status(), 200);
  assert.equal(fullBody.mode, 'full');
  const before = await page.evaluate(async (showtimeId) => {
    const request = indexedDB.open('thudemo_scanner_db');
    const db = await new Promise((resolve, reject) => { request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['showtime_meta', 'tickets'], 'readonly');
      const metaReq = tx.objectStore('showtime_meta').get(showtimeId);
      const ticketsReq = tx.objectStore('tickets').index('showtimeId').getAll(showtimeId);
      tx.oncomplete = () => resolve({ meta: metaReq.result, tickets: ticketsReq.result });
      tx.onerror = () => reject(tx.error);
    });
  }, fixture.showtimeId);
  assert.equal(before.meta.status, 'ready');
  assert.equal(before.meta.ticketCount, 40);
  const ticket = fixture.tickets[0];
  report.cachedTicketCode = ticket.ticketId;
  const checkIn = await page.evaluate(async ({ showtimeId, gateId, qrPayload }) => {
    const response = await fetch(`/api/showtimes/${showtimeId}/check-in`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ qrPayload, gateId, requestId: crypto.randomUUID() }) });
    return { status: response.status, body: await response.json() };
  }, { showtimeId: fixture.showtimeId, gateId: fixture.gateId, qrPayload: ticket.qrPayload });
  report.serverChangeStatus = checkIn.status;
  assert.equal(checkIn.status, 200);
  const staleMeta = await page.evaluate(async (showtimeId) => {
    const request = indexedDB.open('thudemo_scanner_db');
    const db = await new Promise((resolve, reject) => { request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('showtime_meta', 'readwrite');
      const store = tx.objectStore('showtime_meta');
      const get = store.get(showtimeId);
      let saved;
      get.onsuccess = () => { saved = { ...get.result, lastSyncAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() }; store.put(saved); };
      tx.oncomplete = () => resolve(saved);
      tx.onerror = () => reject(tx.error);
    });
  }, fixture.showtimeId);
  report.staleAgeMinutes = (Date.now() - Date.parse(staleMeta.lastSyncAt)) / 60000;
  const deltaResponsePromise = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/tickets') && new URL(response.url()).searchParams.has('since'), { timeout: 20000 });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const deltaResponse = await deltaResponsePromise;
  const delta = await deltaResponse.json();
  report.delta = { status: deltaResponse.status(), mode: delta.mode, changedCount: delta.tickets?.length ?? null, changedTickets: (delta.tickets ?? []).map((item) => ({ code: item.code, status: item.status, checkedInAt: item.checkedInAt })), cursor: delta.cursor };
  assert.equal(deltaResponse.status(), 200);
  assert.equal(delta.mode, 'delta');
  assert.ok(delta.tickets.some((item) => item.code === ticket.ticketId && item.status === 'checked_in'));
  const after = await page.evaluate(async ({ showtimeId, ticketId }) => {
    const request = indexedDB.open('thudemo_scanner_db');
    const db = await new Promise((resolve, reject) => { request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['showtime_meta', 'tickets'], 'readonly');
      const metaReq = tx.objectStore('showtime_meta').get(showtimeId);
      const ticketReq = tx.objectStore('tickets').get([showtimeId, ticketId]);
      tx.oncomplete = () => resolve({ meta: metaReq.result, ticket: ticketReq.result });
      tx.onerror = () => reject(tx.error);
    });
  }, { showtimeId: fixture.showtimeId, ticketId: ticket.ticketId });
  report.localAfterDelta = { ticketStatus: after.ticket?.status, checkedInAt: after.ticket?.checkedInAt, ticketCount: after.meta?.ticketCount, cursorChanged: after.meta?.cursor !== before.meta.cursor, lastSyncAdvanced: Date.parse(after.meta?.lastSyncAt) > Date.parse(staleMeta.lastSyncAt) };
  assert.equal(after.ticket?.status, 'checked_in');
  assert.equal(after.meta.ticketCount, 40);
  assert.ok(report.localAfterDelta.cursorChanged && report.localAfterDelta.lastSyncAdvanced);
  report.checks.push('full snapshot downloaded', 'server-side check-in changed one ticket', '31-minute stale cache auto-fetched one delta cursor on reconnect', 'IndexedDB merged changed checked-in status and advanced cursor without changing ticket count');
  await page.screenshot({ path: resolve(evidenceDir, 'r19-delta-desktop.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push('r19-delta-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  report.mobileNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.equal(report.mobileNoOverflow, true);
  await page.screenshot({ path: resolve(evidenceDir, 'r19-delta-mobile.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push('r19-delta-mobile.png');
  assert.equal(report.pageErrors.length, 0);
  writeFileSync(resolve(evidenceDir, 'r19-delta-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`R19 delta browser check passed; evidence saved in ${evidenceDir}.`);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(evidenceDir, 'r19-delta-browser.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await context?.close();
}
