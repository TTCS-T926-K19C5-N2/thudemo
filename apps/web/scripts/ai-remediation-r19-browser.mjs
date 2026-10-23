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
const profileDir = resolve(cacheDir, 'r19-browser-profile-d13-retest');
const report = {
  runId,
  environment: 'Isolated Codegym app on loopback backed by run-bound PostgreSQL; no camera/provider/real network.',
  viewports: ['1440x1000', '390x844'],
  camera: false,
  checks: [],
  screenshots: [],
  api: [],
  pageErrors: [],
};
const simulatePartialAck = process.env.AI_REMEDIATION_R19_PARTIAL_ACK === '1';
function check(value, name) {
  assert(value, name);
  report.checks.push(name);
}
let context;
try {
  context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'allow',
  });
  await context.addCookies([{
    name: 'event_session',
    value: fixture.token,
    url: 'http://127.0.0.1:3410',
    expires: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  let page = context.pages()[0] ?? await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.pathname.includes('/scanner/') || url.pathname.endsWith('/check-in')) {
      const entry = { method: res.request().method(), path: url.pathname, status: res.status() };
      if (url.pathname === '/api/scanner/sync-scans') {
        try { entry.batchCount = res.request().postDataJSON()?.scans?.length ?? null; } catch {}
      }
      report.api.push(entry);
    }
  });
  await page.goto('http://127.0.0.1:3410/scanner/snapshot', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Vào máy quét suất này' }).waitFor({ timeout: 10000 });
  check((await page.getByText(fixture.eventName ?? 'R19 fixture', { exact: false }).count()) > 0, 'assigned showtime rendered');
  await page.getByRole('button', { name: 'Vào máy quét suất này' }).click();
  await page.getByRole('button', { name: /Tải (lại toàn bộ )?danh sách/ }).click();
  await page.getByText('Đã tải mới nhất', { exact: true }).waitFor({ timeout: 15000 });
  const snapshot = await page.evaluate(async (showtimeId) => {
    const response = await fetch(`/api/scanner/showtimes/${showtimeId}/tickets`);
    return response.json();
  }, fixture.showtimeId);
  const snapshotText = JSON.stringify(snapshot);
  check(snapshot.mode === 'full' && snapshot.totalTickets === 40, 'full snapshot reports exactly 40 paid fixture tickets');
  check(!snapshotText.includes('@r19-fixture.invalid') && !snapshotText.includes('R19 Synthetic Scanner'), 'snapshot contains no fixture email or staff name');
  const localSnapshot = await page.evaluate((showtimeId) => new Promise((resolve, reject) => {
    const request = indexedDB.open('thudemo_scanner_db');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['showtime_meta', 'tickets'], 'readonly');
      const metaRequest = tx.objectStore('showtime_meta').get(showtimeId);
      const ticketRequest = tx.objectStore('tickets').index('showtimeId').getAll(showtimeId);
      tx.oncomplete = () => resolve({ meta: metaRequest.result, tickets: ticketRequest.result });
      tx.onerror = () => reject(tx.error);
    };
  }), fixture.showtimeId);
  report.localSnapshotSummary = {
    hasValidDownloadTime: Number.isFinite(Date.parse(localSnapshot.meta?.downloadedAt)),
    metaStatus: localSnapshot.meta?.status ?? null,
    hasVerificationKey: Boolean(localSnapshot.meta?.keyId),
    ticketCount: localSnapshot.tickets.length,
    allFixtureTicketsPresent: fixture.tickets.every((item) => localSnapshot.tickets.some((ticket) => ticket.code === item.ticketId)),
    ticketStatus: localSnapshot.tickets[0]?.status ?? null,
    ticketFieldSets: [...new Set(localSnapshot.tickets.map((ticket) => Object.keys(ticket).sort().join(',')))],
  };
  check(Number.isFinite(Date.parse(localSnapshot.meta?.downloadedAt)) && localSnapshot.meta?.status === 'ready' && localSnapshot.meta?.keyId && localSnapshot.tickets.length === 40 && fixture.tickets.every((item) => localSnapshot.tickets.some((ticket) => ticket.code === item.ticketId && ticket.status === 'valid' && Object.keys(ticket).sort().join(',') === 'code,showtimeId,status')), 'IndexedDB durably stores download time, key and all 40 tickets with only showtime partition, code and status');
  await page.screenshot({ path: resolve(evidenceDir, 'r19-snapshot-desktop.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push('r19-snapshot-desktop.png');

  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Tải cửa được phân công' }).click();
  await page.getByLabel('Cửa hiện tại').waitFor();
  await page.locator('select[aria-label="Cửa hiện tại"] option').filter({ hasText: 'R19 Gate A' }).waitFor({ state: 'attached', timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('#ticket-code')?.disabled);
  await page.waitForFunction(() => {
    const e = document.querySelector('[data-testid="network-status"]');
    return e?.textContent?.includes('Trực tuyến');
  });
  await page.getByText('Giao diện đã sẵn sàng mở lại khi mất mạng.', { exact: true }).waitFor({ timeout: 35000 });
  await page.context().setOffline(true);
  await page.waitForFunction(() => document.querySelector('[data-testid="network-status"]')?.textContent?.includes('Ngoại tuyến'));
  for (let index = 0; index < fixture.tickets.length; index++) {
    await page.getByLabel('Hoặc nhập mã vé').fill(fixture.tickets[index].qrPayload);
    await page.getByRole('button', { name: 'Kiểm tra vé' }).click();
    await page.getByTestId('ticket-scan-status').filter({ hasText: 'Check-in thành công (ngoại tuyến)' }).waitFor({ timeout: 10000 });
    await page.waitForFunction(async (expected) => {
      const request = indexedDB.open('thudemo_scanner_db');
      const db = await new Promise((resolve, reject) => { request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('durable_scans', 'readonly');
        const items = tx.objectStore('durable_scans').getAll();
        tx.oncomplete = () => resolve(items.result.filter((item) => item.showtimeId === expected.showtimeId && item.status === 'pending').length === expected.count);
        tx.onerror = () => reject(tx.error);
      });
    }, { showtimeId: fixture.showtimeId, count: index + 1 }, { timeout: 10000 });
  }
  await page.getByTestId('pending-scans-count').filter({ hasText: '40 lượt quét chờ đồng bộ' }).waitFor();
  const queued = await page.evaluate((showtimeId) => new Promise((resolve, reject) => {
    const request = indexedDB.open('thudemo_scanner_db');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('durable_scans', 'readonly');
      const items = tx.objectStore('durable_scans').index('showtimeId').getAll(showtimeId);
      tx.oncomplete = () => resolve(items.result.map((item) => ({ ticketCode: item.ticketCode, status: item.status, requestId: item.requestId })));
      tx.onerror = () => reject(tx.error);
    };
  }), fixture.showtimeId);
  check(queued.length === 40 && queued.every((item) => item.status === 'pending') && new Set(queued.map((item) => item.ticketCode)).size === 40, 'all 40 offline scans are durably queued in IndexedDB before success is reported');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'offline scan UI has no horizontal overflow at desktop');
  await page.screenshot({ path: resolve(evidenceDir, 'r19-offline-queued-desktop.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push('r19-offline-queued-desktop.png');

  await context.close();
  context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'allow',
  });
  await context.setOffline(true);
  page = context.pages()[0] ?? await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.pathname.startsWith('/api/scanner/') || url.pathname.endsWith('/check-in')) {
      const entry = { method: res.request().method(), path: url.pathname, status: res.status() };
      if (url.pathname === '/api/scanner/sync-scans') {
        try { entry.batchCount = res.request().postDataJSON()?.scans?.length ?? null; } catch {}
      }
      report.api.push(entry);
    }
  });
  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByTestId('pending-scans-count').filter({ hasText: '40 lượt quét chờ đồng bộ' }).waitFor({ timeout: 15000 });
  const reopenedQueue = await page.evaluate((showtimeId) => new Promise((resolve, reject) => {
    const request = indexedDB.open('thudemo_scanner_db');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction('durable_scans', 'readonly');
      const items = tx.objectStore('durable_scans').index('showtimeId').getAll(showtimeId);
      tx.oncomplete = () => resolve(items.result.map((item) => ({ ticketCode: item.ticketCode, status: item.status, requestId: item.requestId })));
      tx.onerror = () => reject(tx.error);
    };
  }), fixture.showtimeId);
  check(reopenedQueue.length === 40 && reopenedQueue.every((item) => item.status === 'pending') && new Set(reopenedQueue.map((item) => item.requestId)).size === 40 && queued.every((item) => reopenedQueue.some((saved) => saved.requestId === item.requestId && saved.ticketCode === item.ticketCode)), 'all 40 durable queue records and stable request IDs survive browser process relaunch');
  report.offlineReopenState = await page.evaluate(() => ({
    inputDisabled: document.querySelector('#ticket-code')?.disabled ?? null,
    showtimeId: document.querySelector('select[aria-label="Mã suất diễn"]')?.value ?? null,
    selectedGate: document.querySelector('select[aria-label="Cửa hiện tại"]')?.selectedOptions[0]?.textContent ?? null,
    alerts: Array.from(document.querySelectorAll('[role="alert"]')).map((element) => element.textContent?.trim() ?? ''),
  }));
  report.offlineReopenState.persistedShowtimeSelected = await page.evaluate(() => Boolean(localStorage.getItem('checkin_showtime_s29')));
  report.offlineReopenState.persistedStaffIdentity = await page.evaluate(() => Boolean(localStorage.getItem('scanner.staff-identity')));
  report.offlineReopenState.persistedShowtimeGrant = await page.evaluate((showtimeId) => Boolean(localStorage.getItem(`scanner.grants.${showtimeId}`)), fixture.showtimeId);
  check(report.offlineReopenState.inputDisabled === false, 'scanner input remains enabled after offline browser relaunch');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'offline queue survives browser context close/reopen at 390px without horizontal overflow');
  await page.screenshot({ path: resolve(evidenceDir, 'r19-offline-reopened-mobile.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push('r19-offline-reopened-mobile.png');
  report.syncedRequestId = reopenedQueue[0].requestId;
  const syncResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && url.pathname === '/api/scanner/sync-scans';
  }, { timeout: 20000 });
  const firstBatchState = {};
  if (simulatePartialAck) {
    await page.route('**/api/scanner/sync-scans', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      firstBatchState.serverAckCount = body.results?.length ?? 0;
      const partial = { ...body, results: (body.results ?? []).slice(0, 20) };
      await route.fulfill({ response, body: JSON.stringify(partial) });
    });
  }
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine, { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  report.reconnectState = await page.evaluate(() => ({
    navigatorOnline: navigator.onLine,
    networkStatus: document.querySelector('[data-testid="network-status"]')?.textContent?.trim() ?? null,
  }));
  const syncResponseValue = await syncResponse;
  const syncAck = await syncResponseValue.json();
  const firstAckIds = (syncAck.results ?? []).filter((item) => item.status === 'synced').map((item) => item.scanId);
  let retryIds = [];
  if (simulatePartialAck) {
    report.firstBatchHttpStatus = syncResponseValue.status();
    report.firstBatchServerAckCount = firstBatchState.serverAckCount;
    report.firstBatchDeliveredAckCount = syncAck.results?.length ?? 0;
    check(report.firstBatchHttpStatus === 200 && report.firstBatchServerAckCount === 40 && firstAckIds.length === 20, 'server commits 40 scans but client receives only 20 ACKs in the partial-ACK simulation');
    await page.getByTestId('pending-scans-count').filter({ hasText: '20 lượt quét chờ đồng bộ' }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: resolve(evidenceDir, 'r19-partial-ack-pending-mobile.png'), fullPage: true, animations: 'disabled' });
    report.screenshots.push('r19-partial-ack-pending-mobile.png');
    await page.unroute('**/api/scanner/sync-scans');
    const retryResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.pathname === '/api/scanner/sync-scans';
    }, { timeout: 20000 });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const retryResponseValue = await retryResponse;
    const retryAck = await retryResponseValue.json();
    retryIds = (retryAck.results ?? []).filter((item) => item.status === 'synced').map((item) => item.scanId);
    report.retryBatchHttpStatus = retryResponseValue.status();
    report.retryBatchCount = retryResponseValue.request().postDataJSON()?.scans?.length ?? null;
    report.retryBatchAckCount = retryIds.length;
    report.syncHttpStatus = retryResponseValue.status();
    report.syncAckStatus = retryAck.results?.[0]?.status ?? null;
    check(report.retryBatchHttpStatus === 200 && report.retryBatchCount === 20 && retryIds.length === 20 && new Set([...firstAckIds, ...retryIds]).size === 40, 'retry sends only the remaining 20 with original request IDs and receives 20 durable ACKs');
  } else {
    report.syncHttpStatus = syncResponseValue.status();
    report.syncAckStatus = syncAck.results?.[0]?.status ?? null;
    check(report.syncHttpStatus === 200 && report.syncAckStatus === 'synced' && firstAckIds.length === 40 && new Set(firstAckIds).size === 40, 'real server returns durable ACKs for the full 40-item batch');
  }
  report.syncedRequestIds = [...firstAckIds, ...retryIds];
  await page.waitForFunction(async (showtimeId) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('thudemo_scanner_db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('durable_scans', 'readonly');
      const items = tx.objectStore('durable_scans').index('showtimeId').getAll(showtimeId);
      tx.oncomplete = () => resolve(items.result.length === 0);
      tx.onerror = () => reject(tx.error);
    });
  }, fixture.showtimeId, { timeout: 10000 });
  const syncBatchSizes = report.api.filter((item) => item.method === 'POST' && item.path === '/api/scanner/sync-scans' && item.status === 200).map((item) => item.batchCount);
  check(simulatePartialAck ? syncBatchSizes.join(',') === '40,20' : syncBatchSizes.join(',') === '40', simulatePartialAck ? 'ACKed records are removed and the remaining 20 are retried; queue reaches zero only after real PostgreSQL-backed ACKs' : '40 pending scans are removed only after the full real PostgreSQL-backed batch ACK');
  check(report.pageErrors.length === 0, 'browser has no uncaught page errors');
  check(!report.api.some((r) => r.status >= 500), 'captured scanner API requests have no server error');
  writeFileSync(resolve(evidenceDir, 'r19-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`R19 browser checks passed: ${report.checks.length}; evidence saved in ${evidenceDir}.`);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(evidenceDir, 'r19-browser.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await context?.close();
}
