import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
assert.ok(fixture.alternateUserId && fixture.alternateToken);
const viewportName = process.env.AI_REMEDIATION_VIEWPORT === 'desktop' ? 'desktop' : 'mobile';
const viewport = viewportName === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 };
const ticketOffset = viewportName === 'desktop' ? 2 : 0;
const screenshotPath = (step) => `int07-${step}-${viewportName}.png`;
const browserReportPath = viewportName === 'desktop' ? 'r19-int07-offline-recovery-browser-desktop.json' : 'r19-int07-offline-recovery-browser.json';
mkdirSync(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport, serviceWorkers: 'allow' });
const report = {
  runId,
  environment: 'Single persistent browser context, current local web/API build, isolated PostgreSQL; HTTP fault injection only at API response boundary; no real network/provider.',
  viewports: [`${viewport.width}x${viewport.height}`],
  failuresInjected: [],
  http: [],
  pageErrors: [],
  screenshots: [],
};
await context.addCookies([{ name: 'event_session', value: fixture.token, url: 'http://127.0.0.1:3410', expires: Math.floor(Date.now() / 1000) + 4 * 60 * 60, httpOnly: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.on('pageerror', (error) => report.pageErrors.push(error.message));
page.on('response', (response) => {
  const url = new URL(response.url());
  if (url.pathname === '/api/scanner/sync-scans') report.http.push({ method: response.request().method(), status: response.status(), path: url.pathname });
});
const readRows = async () => page.evaluate((showtimeId) => new Promise((resolve, reject) => {
  const request = indexedDB.open('thudemo_scanner_db');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const tx = request.result.transaction('durable_scans', 'readonly');
    const getAll = tx.objectStore('durable_scans').index('showtimeId').getAll(showtimeId);
    tx.oncomplete = () => resolve(getAll.result.map((row) => ({ requestId: row.requestId, ticketCode: row.ticketCode, staffId: row.staffId, deviceId: row.deviceId, scannedAt: row.createdAt, status: row.status, retryCount: row.retryCount })));
    tx.onerror = () => reject(tx.error);
  };
}), fixture.showtimeId);
const waitPending = async (count) => {
  await page.waitForFunction(async (expected) => {
    const request = indexedDB.open('thudemo_scanner_db');
    const db = await new Promise((resolve, reject) => { request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('durable_scans', 'readonly');
      const rows = tx.objectStore('durable_scans').index('showtimeId').getAll(document.querySelector('select[aria-label="Mã suất diễn"]')?.value ?? '');
      tx.oncomplete = () => resolve(rows.result.filter((row) => row.status !== 'synced').length === expected);
      tx.onerror = () => reject(tx.error);
    });
  }, count, { timeout: 10000 });
};
async function waitOffline() {
  await context.setOffline(true);
  await page.waitForFunction(() => document.querySelector('[data-testid="network-status"]')?.textContent?.includes('Ngoại tuyến'));
}
async function goOnlineAndSync() {
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/scanner/sync-scans', { timeout: 15000 });
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine, { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  return responsePromise;
}
async function queueOffline(ticketIndex) {
  const ticket = fixture.tickets[ticketIndex];
  await page.getByLabel('Hoặc nhập mã vé').fill(ticket.qrPayload);
  await page.getByRole('button', { name: 'Kiểm tra vé' }).click();
  await page.getByTestId('ticket-scan-status').filter({ hasText: 'Check-in thành công (ngoại tuyến)' }).waitFor({ timeout: 10000 });
  const rows = await readRows();
  const scan = rows.find((row) => row.ticketCode === ticket.ticketId && row.status === 'pending');
  assert.ok(scan);
  assert.equal(scan.staffId, fixture.userId);
  return scan;
}

try {
  await page.goto('http://127.0.0.1:3410/scanner/snapshot', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Vào máy quét suất này' }).click();
  await page.getByRole('button', { name: /Tải (lại toàn bộ )?danh sách/ }).click();
  await page.getByText('Đã tải mới nhất', { exact: true }).waitFor({ timeout: 15000 });
  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Tải cửa được phân công' }).click();
  await page.getByLabel('Cửa hiện tại').selectOption(fixture.gateId);
  await page.waitForFunction(() => !document.querySelector('#ticket-code')?.disabled, { timeout: 10000 });
  await page.getByText('Giao diện đã sẵn sàng mở lại khi mất mạng.', { exact: true }).waitFor({ timeout: 35000 });

  await waitOffline();
  const committedScan = await queueOffline(ticketOffset);
  report.committedScanId = committedScan.requestId;
  report.committedTicketCode = committedScan.ticketCode;
  await page.route('**/api/scanner/sync-scans', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    report.commitThenDrop = { backendStatus: response.status(), serverAckCount: body.results?.length ?? 0, serverAck: body.results?.[0]?.status ?? null };
    await route.abort('failed');
  });
  const failedRequest = page.waitForEvent('requestfailed', { predicate: (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/scanner/sync-scans', timeout: 15000 });
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await failedRequest;
  await page.unroute('**/api/scanner/sync-scans');
  await waitPending(1);
  let rows = await readRows();
  const stillCommitted = rows.find((row) => row.requestId === committedScan.requestId);
  assert.ok(stillCommitted && stillCommitted.status === 'pending');
  report.afterLostResponse = { pendingCount: 1, sameRequestId: stillCommitted.requestId === committedScan.requestId, retryCount: stillCommitted.retryCount };
  await page.screenshot({ path: resolve(evidenceDir, screenshotPath('commit-response-lost')), fullPage: true, animations: 'disabled' });
  report.screenshots.push(screenshotPath('commit-response-lost'));

  const recoveryResponsePromise = goOnlineAndSync();
  const recoveryResponse = await recoveryResponsePromise;
  const recoveryBody = await recoveryResponse.json();
  report.commitThenDrop.recovery = { status: recoveryResponse.status(), ackCount: recoveryBody.results?.length ?? 0, ackStatus: recoveryBody.results?.[0]?.status ?? null, ackCode: recoveryBody.results?.[0]?.code ?? null };
  assert.equal(recoveryResponse.status(), 200);
  await waitPending(0);

  await waitOffline();
  const protectedScan = await queueOffline(ticketOffset + 1);
  report.protectedScanId = protectedScan.requestId;
  report.protectedTicketCode = protectedScan.ticketCode;
  for (const status of [401, 403, 409, 500, 503]) {
    await waitOffline();
    await page.route('**/api/scanner/sync-scans', (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: `FIXTURE_HTTP_${status}`, message: 'Synthetic response; queue must remain durable.' }) }));
    const responsePromise = goOnlineAndSync();
    const response = await responsePromise;
    assert.equal(response.status(), status);
    await page.unroute('**/api/scanner/sync-scans');
    await waitPending(1);
    rows = await readRows();
    const retained = rows.find((row) => row.requestId === protectedScan.requestId);
    assert.ok(retained && retained.status === 'pending' && retained.requestId === protectedScan.requestId);
    report.failuresInjected.push({ status, requestIdPreserved: retained.requestId, pendingCount: 1, retryCount: retained.retryCount });
  }
  await page.screenshot({ path: resolve(evidenceDir, screenshotPath('http-failures-retained')), fullPage: true, animations: 'disabled' });
  report.screenshots.push(screenshotPath('http-failures-retained'));

  await waitOffline();
  await context.clearCookies();
  await context.addCookies([{ name: 'event_session', value: fixture.alternateToken, url: 'http://127.0.0.1:3410', expires: Math.floor(Date.now() / 1000) + 4 * 60 * 60, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Tải cửa được phân công' }).click().catch(() => {});
  await page.waitForTimeout(300);
  const postCountBeforeAlternateSync = report.http.filter((request) => request.method === 'POST').length;
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1200);
  const postCountAfterAlternateSync = report.http.filter((request) => request.method === 'POST').length;
  await waitPending(1);
  rows = await readRows();
  const acrossAccount = rows.find((row) => row.requestId === protectedScan.requestId);
  assert.equal(postCountAfterAlternateSync, postCountBeforeAlternateSync, 'queue from previous staff identity must not be sent by alternate staff account');
  assert.ok(acrossAccount && acrossAccount.staffId === fixture.userId && acrossAccount.requestId === protectedScan.requestId && acrossAccount.status === 'pending');
  report.accountSwitch = { previousStaffId: fixture.userId, alternateStaffId: fixture.alternateUserId, syncPostsForForeignQueue: postCountAfterAlternateSync - postCountBeforeAlternateSync, pendingCount: 1, sameRequestId: acrossAccount.requestId };
  await page.screenshot({ path: resolve(evidenceDir, screenshotPath('alternate-account-queue-retained')), fullPage: true, animations: 'disabled' });
  report.screenshots.push(screenshotPath('alternate-account-queue-retained'));

  await waitOffline();
  await context.clearCookies();
  await context.addCookies([{ name: 'event_session', value: fixture.token, url: 'http://127.0.0.1:3410', expires: Math.floor(Date.now() / 1000) + 4 * 60 * 60, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Tải cửa được phân công' }).click().catch(() => {});
  const finalResponse = await goOnlineAndSync();
  const finalBody = await finalResponse.json();
  report.finalRecovery = { status: finalResponse.status(), ackCount: finalBody.results?.length ?? 0, ackStatus: finalBody.results?.[0]?.status ?? null, ackCode: finalBody.results?.[0]?.code ?? null };
  assert.equal(finalResponse.status(), 200);
  await waitPending(0);
  rows = await readRows();
  report.finalLocalQueue = rows.filter((row) => [committedScan.requestId, protectedScan.requestId].includes(row.requestId)).map((row) => ({ requestId: row.requestId, ticketCode: row.ticketCode, status: row.status, staffId: row.staffId }));
  assert.ok(report.finalLocalQueue.length === 2 && report.finalLocalQueue.every((row) => row.status === 'synced' && row.staffId === fixture.userId));
  assert.equal(report.pageErrors.length, 0);
  writeFileSync(resolve(evidenceDir, browserReportPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log('INT-07 browser queue persistence/recovery flow completed; independent PostgreSQL oracle is a separate step.');
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  report.pageErrors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  try { writeFileSync(resolve(evidenceDir, browserReportPath), `${JSON.stringify(report, null, 2)}\n`); } catch {}
  throw error;
} finally {
  await context.close();
  await browser.close();
}
