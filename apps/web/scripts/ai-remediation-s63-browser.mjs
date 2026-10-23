import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'evidence/ai-remediation', runId);
const fixture = JSON.parse(readFileSync(resolve(root, '.cache/ai-remediation', runId, 's63-fixture.json'), 'utf8'));
if (fixture.runId !== runId) throw new Error('Fixture ownership mismatch');
const baseUrl = 'http://127.0.0.1:3410';
const browser = await chromium.launch({ headless: true });
const results = { runId, showtimeId: fixture.showtimeId, viewports: [], pageErrors: [], oracle: { started: 10, orderCreated: 5, paid: 3, expired: 5, pendingAtCutoff: 1 } };
async function login(page) {
  const path = `/showtimes/${fixture.showtimeId}/manage`;
  await page.goto(`${baseUrl}/login?returnTo=${encodeURIComponent(path)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(fixture.email);
  await page.locator('input[type=password]').fill(fixture.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/events', { timeout: 15000 });
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Chuyển đổi lượt giữ chỗ' }).waitFor({ timeout: 15000 });
}
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => results.pageErrors.push(`${name}: ${error.message}`));
    if (name === 'mobile') await page.route('**/api/showtimes/*/hold-conversion-report*', async (route) => { await new Promise((resolve) => setTimeout(resolve, 800)); await route.continue(); });
    page.on('response', async (response) => {
      if (response.url().includes('/hold-conversion-report') && response.ok()) {
        try { const payload = await response.json(); if (payload.startedSessions > 0) results.apiResponse = payload; } catch { /* response diagnostic stays in browser assertions */ }
      }
    });
    await login(page);
    await page.getByRole('button', { name: 'Xem báo cáo' }).click();
    if (name === 'mobile') {
      await page.getByRole('button', { name: 'Đang tải…' }).waitFor({ timeout: 3000 });
      results.loadingStateObserved = true;
    }
    await page.getByText(/Bắt đầu: 10/).waitFor({ timeout: 15000 });
    const summary = await page.locator('section[aria-labelledby="hold-conversion-title"]').innerText();
    for (const expected of ['Thành đơn: 5', 'Đã trả: 3', 'Hết hạn: 5', 'Đã hủy: 0', 'Đang giữ tại cutoff: 1', 'Giữ → thành đơn:', 'Giữ → đã trả:', 'Cutoff:', 'cập nhật lúc'])
      if (!summary.includes(expected)) throw new Error(`${name}: expected report text not found: ${expected}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    results.viewports.push({ name, viewport, reportVisible: true, summary, horizontalOverflow: overflow });
    if (name === 'desktop') await page.screenshot({ path: resolve(evidence, 's63-conversion-desktop.png'), fullPage: true });
    else await page.screenshot({ path: resolve(evidence, 's63-conversion-mobile.png'), fullPage: true });
    await page.close();
  }
  const emptyPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  emptyPage.on('pageerror', (error) => results.pageErrors.push(`empty: ${error.message}`));
  await login(emptyPage);
  await emptyPage.getByLabel('Từ ngày').fill('2025-01-01');
  await emptyPage.getByLabel('Đến ngày').fill('2025-01-02');
  await emptyPage.getByRole('button', { name: 'Xem báo cáo' }).click();
  await emptyPage.getByText(/Bắt đầu: 0/).waitFor({ timeout: 15000 });
  if ((await emptyPage.getByText('Chưa có mẫu').count()) < 2) throw new Error('Empty duration sample state not visible');
  results.emptyStateObserved = true;
  await emptyPage.screenshot({ path: resolve(evidence, 's63-conversion-empty.png'), fullPage: true });
  await emptyPage.close();
  const errorPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  errorPage.on('pageerror', (error) => results.pageErrors.push(`error: ${error.message}`));
  await login(errorPage);
  await errorPage.route('**/api/showtimes/*/hold-conversion-report*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic report outage' }) }));
  await errorPage.getByRole('button', { name: 'Xem báo cáo' }).click();
  await errorPage.getByRole('region', { name: 'Chuyển đổi lượt giữ chỗ' }).getByRole('alert').waitFor({ timeout: 10000 });
  results.errorStateObserved = true;
  await errorPage.screenshot({ path: resolve(evidence, 's63-conversion-error.png'), fullPage: true });
  if (results.pageErrors.length) throw new Error('Browser page errors occurred');
  writeFileSync(resolve(evidence, 's63-browser.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ runId, showtimeId: fixture.showtimeId, viewports: results.viewports.map(({ name, horizontalOverflow }) => ({ name, horizontalOverflow })), errorStateObserved: results.errorStateObserved, pageErrors: results.pageErrors.length }));
} finally { await browser.close(); }
