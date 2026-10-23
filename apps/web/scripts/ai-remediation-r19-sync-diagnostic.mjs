import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
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
const profileDir = resolve(cacheDir, 'r19-browser-profile-final');
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'allow',
});
const report = { runId, requests: [], failedRequests: [], pageErrors: [] };
try {
  await browser.addCookies([{
    name: 'event_session', value: fixture.token, url: 'http://127.0.0.1:3410', expires: Math.floor(Date.now() / 1000) + 4 * 60 * 60, httpOnly: true, sameSite: 'Lax',
  }]);
  const page = browser.pages()[0] ?? await browser.newPage();
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  page.on('response', async (res) => {
    const url = new URL(res.url());
    if (!url.pathname.startsWith('/api/')) return;
    report.requests.push({ method: res.request().method(), path: url.pathname, status: res.status() });
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    report.failedRequests.push({ path: url.pathname, error: request.failure()?.errorText ?? 'unknown' });
  });
  await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('pending-scans-count').waitFor({ timeout: 10000 }).catch(() => {});
  const syncNow = page.getByRole('button', { name: 'Đồng bộ ngay' });
  if (await syncNow.count()) await syncNow.click();
  const retry = page.getByRole('button', { name: 'Thử kết nối lại' });
  if (await retry.count()) await retry.click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="pending-scans-count"]'), null, { timeout: 15000 }).catch(() => {});
  report.state = await page.evaluate((showtimeId) => ({
    navigatorOnline: navigator.onLine,
    networkStatus: document.querySelector('[data-testid="network-status"]')?.textContent?.trim() ?? null,
    pendingText: document.querySelector('[data-testid="pending-scans-count"]')?.textContent?.trim() ?? null,
    syncMessage: Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.textContent?.trim() ?? '').find((x) => x.includes('đồng bộ')) ?? null,
    inputDisabled: document.querySelector('#ticket-code')?.disabled ?? null,
  }), fixture.showtimeId);
  writeFileSync(resolve(evidenceDir, 'r19-sync-diagnostic.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`R19 sync diagnostic finished; ${report.requests.length} API responses recorded.`);
} finally {
  await browser.close();
}
