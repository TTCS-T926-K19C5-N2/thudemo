import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '../../..');
const runId = process.env.AI_REMEDIATION_RUN_ID;
assert.match(runId ?? '', /^\d{8}T\d{6}-remediation$/);
const stateDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const fixture = JSON.parse(readFileSync(resolve(stateDir, 'waitlist-browser-fixture.json'), 'utf8'));
assert.equal(fixture.runId, runId);
const report = { runId, viewports: ['1440x1000', '390x844'], pageErrors: [], checks: [], screenshots: [] };
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:3410/login?returnTo=${encodeURIComponent(`/shows/${fixture.showtimeId}/seats`)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('#login-email').fill(fixture.email);
  await page.locator('#login-password').fill(fixture.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => url.pathname === `/shows/${fixture.showtimeId}/seats`, { timeout: 20000 });
  report.navigation = { url: page.url(), title: await page.title(), body: (await page.locator('body').innerText()).slice(0, 1200) };
  console.log(JSON.stringify(report.navigation));
  await page.screenshot({ path: resolve(evidenceDir, 'r13-waitlist-navigation-diagnostic.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('heading', { name: 'Thông báo khi có ghế' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Đăng ký nhận thông báo' }).click();
  await page.getByText(/Đang chờ · vị trí 1/).waitFor({ timeout: 10000 });
  const desktopText = await page.locator('main').innerText();
  assert.match(desktopText, /FIFO|thứ tự đăng ký/i);
  assert.match(desktopText, /Đang chờ · vị trí 1/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(evidenceDir, 'r13-waitlist-desktop.png'), fullPage: true, animations: 'disabled' });
  report.checks.push('desktop sold-out showtime displayed FIFO/no-reservation copy and registered buyer at position 1');
  report.screenshots.push('r13-waitlist-desktop.png');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(evidenceDir, 'r13-waitlist-mobile.png'), fullPage: true, animations: 'disabled' });
  report.checks.push('mobile waitlist view has no horizontal overflow');
  report.screenshots.push('r13-waitlist-mobile.png');
  assert.equal(report.pageErrors.length, 0);
  assert(!desktopText.includes(fixture.email));
  report.checks.push('synthetic subscriber email is not exposed in the page');
  writeFileSync(resolve(evidenceDir, 'r13-waitlist-desktop-browser.json'), JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
}
