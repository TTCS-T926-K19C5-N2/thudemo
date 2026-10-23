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
assert.ok(fixture.secondGateId);
mkdirSync(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  runId,
  environment: 'Two isolated Chromium browser contexts, run-bound staff/organizer account, current local build, isolated API/PostgreSQL; no camera or real network.',
  syncOrder: ['mobile-device-B (later timestamp)', 'desktop-device-A (earlier timestamp)'],
  devices: [],
  http: [],
  pageErrors: [],
  screenshots: [],
};
const browserConfigs = [
  { name: 'desktop-device-A', viewport: { width: 1440, height: 1000 }, gateId: fixture.gateId, gateName: 'R19 Gate A' },
  { name: 'mobile-device-B', viewport: { width: 390, height: 844 }, gateId: fixture.secondGateId, gateName: 'R19 Gate B' },
];
const readScan = async (page) => page.evaluate(({ showtimeId, ticketCode }) => new Promise((resolve, reject) => {
  const request = indexedDB.open('thudemo_scanner_db');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction('durable_scans', 'readonly');
    const getAll = tx.objectStore('durable_scans').index('showtimeId').getAll(showtimeId);
    tx.oncomplete = () => {
      const found = getAll.result.find((scan) => scan.ticketCode === ticketCode);
      resolve(found ? { scanId: found.requestId, ticketCode: found.ticketCode, scannedAt: found.createdAt, deviceId: found.deviceId, gateId: found.gateId, status: found.status, mode: found.mode } : null);
    };
    tx.onerror = () => reject(tx.error);
  };
}), { showtimeId: fixture.showtimeId, ticketCode: fixture.tickets[0].ticketId });

async function prepare(name, viewport, gateId) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'allow' });
  await context.addCookies([{
    name: 'event_session', value: fixture.token, url: 'http://127.0.0.1:3410',
    expires: Math.floor(Date.now() / 1000) + 4 * 60 * 60, httpOnly: true, sameSite: 'Lax',
  }]);
  const page = await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(`${name}: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname === '/api/scanner/sync-scans' || url.pathname.includes('/conflicts'))
      report.http.push({ device: name, method: response.request().method(), path: url.pathname.replace(fixture.showtimeId, '<fixture-showtime>'), status: response.status() });
  });
  await page.goto('http://127.0.0.1:3410/scanner/snapshot', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Vào máy quét suất này' }).click();
  await page.getByRole('button', { name: /Tải (lại toàn bộ )?danh sách/ }).click();
  await page.getByText('Đã tải mới nhất', { exact: true }).waitFor({ timeout: 15000 });
  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Tải cửa được phân công' }).click();
  await page.getByLabel('Cửa hiện tại').waitFor();
  await page.getByLabel('Cửa hiện tại').selectOption(gateId);
  await page.waitForFunction(() => !document.querySelector('#ticket-code')?.disabled, { timeout: 10000 });
  await page.getByText('Giao diện đã sẵn sàng mở lại khi mất mạng.', { exact: true }).waitFor({ timeout: 35000 });
  await context.setOffline(true);
  await page.waitForFunction(() => document.querySelector('[data-testid="network-status"]')?.textContent?.includes('Ngoại tuyến'));
  return { context, page };
}

async function scanOffline(device, qrPayload) {
  await device.page.getByLabel('Hoặc nhập mã vé').fill(qrPayload);
  await device.page.getByRole('button', { name: 'Kiểm tra vé' }).click();
  await device.page.getByTestId('ticket-scan-status').filter({ hasText: 'Check-in thành công (ngoại tuyến)' }).waitFor({ timeout: 10000 });
  const scan = await readScan(device.page);
  assert.ok(scan, 'offline scan must be persisted in this browser context IndexedDB');
  assert.equal(scan.status, 'pending');
  assert.equal(scan.mode, 'offline_admission');
  return scan;
}

async function sync(device) {
  const pendingResponse = device.page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/scanner/sync-scans', { timeout: 20000 });
  await device.context.setOffline(false);
  await device.page.waitForFunction(() => navigator.onLine, { timeout: 5000 });
  await device.page.evaluate(() => window.dispatchEvent(new Event('online')));
  const response = await pendingResponse;
  const body = await response.json();
  assert.equal(response.status(), 200);
  assert.equal(body.results?.length, 1);
  return { httpStatus: response.status(), ackStatus: body.results[0].status, ackCode: body.results[0].code };
}

let devices = [];
try {
  devices = await Promise.all(browserConfigs.map(async (config) => ({ ...config, ...(await prepare(config.name, config.viewport, config.gateId)) })));
  const first = devices.find((device) => device.name === 'desktop-device-A');
  const second = devices.find((device) => device.name === 'mobile-device-B');
  const firstScan = await scanOffline(first, fixture.tickets[0].qrPayload);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const secondScan = await scanOffline(second, fixture.tickets[0].qrPayload);
  assert.ok(Date.parse(firstScan.scannedAt) < Date.parse(secondScan.scannedAt), 'device A must hold the earlier original device timestamp');
  assert.notEqual(firstScan.deviceId, secondScan.deviceId, 'independent browser contexts must have distinct device IDs');
  first.scan = firstScan;
  second.scan = secondScan;
  await first.page.screenshot({ path: resolve(evidenceDir, 'int06-offline-before-sync-desktop.png'), fullPage: true, animations: 'disabled' });
  await second.page.screenshot({ path: resolve(evidenceDir, 'int06-offline-before-sync-mobile.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push('int06-offline-before-sync-desktop.png', 'int06-offline-before-sync-mobile.png');

  second.sync = await sync(second);
  first.sync = await sync(first);
  report.devices = devices.map(({ name, viewport, gateName, sync: syncResult, scan }) => ({ name, viewport, gateName, sync: syncResult, scan }));
  assert.deepEqual(report.devices.map((device) => device.sync.httpStatus), [200, 200]);

  for (const device of devices) {
    await device.page.goto(`http://127.0.0.1:3410/scanner/reports/${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
    await device.page.getByRole('heading', { name: 'Xung đột giữa các cửa' }).waitFor();
    await device.page.waitForFunction((ticketCode) => {
      const text = document.querySelector('main.operations-page')?.innerText ?? '';
      return text.includes(ticketCode) && text.includes('R19 Gate A') && text.includes('R19 Gate B');
    }, fixture.tickets[0].ticketId, { timeout: 10000 });
    const reportText = await device.page.locator('main.operations-page').innerText();
    const offsetsVisible = /Lệch: -?\d+ ms/.test(reportText);
    assert.ok(offsetsVisible, `${device.name}: report should show both device/server offsets`);
    if (device.name === 'desktop-device-A') {
      const row = device.page.getByTestId('conflict-row');
      assert.equal(await row.count(), 1);
      assert.ok(reportText.includes('1 lượt xung đột'));
    } else {
      const article = device.page.locator('main article');
      assert.equal(await article.count(), 1);
      assert.ok(await device.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    report.conflictReports ??= [];
    report.conflictReports.push({
      visible: true,
      ticketCode: fixture.tickets[0].ticketId,
      winningGate: 'R19 Gate A',
      losingGate: 'R19 Gate B',
      offsetsVisible,
      device: device.name,
    });
    await device.page.screenshot({ path: resolve(evidenceDir, `int06-conflict-report-${device.name}.png`), fullPage: true, animations: 'disabled' });
    report.screenshots.push(`int06-conflict-report-${device.name}.png`);
  }
  assert.equal(report.pageErrors.length, 0);
  writeFileSync(resolve(evidenceDir, 'r19-int06-conflict-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('INT-06 two-context offline conflict browser flow completed; DB oracle is a separate step.');
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  report.devices = devices.map(({ name, viewport, gateName, sync: syncResult, scan }) => ({ name, viewport, gateName, sync: syncResult, scan }));
  writeFileSync(resolve(evidenceDir, 'r19-int06-conflict-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await Promise.all(devices.map((device) => device.context.close()));
  await browser.close();
}
