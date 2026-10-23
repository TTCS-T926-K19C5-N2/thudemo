import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(import.meta.dirname, '../../..');
const runId = process.env.AI_REMEDIATION_RUN_ID;
assert.match(runId ?? '', /^\d{8}T\d{6}-remediation$/);
const cache = resolve(root, '.cache/ai-remediation', runId);
const evidence = resolve(root, 'evidence/ai-remediation', runId);
const fixture = JSON.parse(readFileSync(resolve(cache, 'browser-fixture.json'), 'utf8'));
assert.equal(fixture.runId, runId);
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { runId, environment: 'Isolated local API/PostgreSQL/Mailpit, two authenticated Chromium viewports; lifecycle worker explicitly off; synthetic fixture only.', viewports: ['1440x1000', '390x844'], http: [], errors: [], screenshots: [] };
async function login(context, email, password, destination) {
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (url.pathname.endsWith(`/showtimes/${fixture.showtimeId}/cancellation`)) report.http.push({ method: r.request().method(), path: '/api/showtimes/{fixture}/cancellation', status: r.status() });
  });
  await page.goto(`http://127.0.0.1:3410/login?returnTo=${encodeURIComponent(destination)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => ['/events', '/account'].includes(url.pathname), { timeout: 15000 });
  if (new URL(page.url()).pathname !== destination)
    await page.goto(`http://127.0.0.1:3410${destination}`, { waitUntil: 'domcontentloaded' });
  return page;
}
try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const desktop = await login(desktopContext, fixture.ownerEmail, fixture.ownerPassword, '/operations');
  await desktop.getByRole('heading', { name: 'Huỷ suất diễn' }).waitFor({ timeout: 15000 });
  await desktop.getByLabel('Suất diễn').selectOption(fixture.showtimeId);
  await desktop.getByLabel('Lý do huỷ').fill('INT-09 isolated show cancellation');
  await desktop.getByLabel('Tôi xác nhận huỷ suất đang chọn và toàn bộ vé thuộc suất này.').check();
  const cancelResponsePromise = desktop.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/showtimes/${fixture.showtimeId}/cancel`, { timeout: 15000 });
  await desktop.getByRole('button', { name: 'Huỷ suất và hoàn tiền giả lập' }).click();
  const cancelResponse = await cancelResponsePromise;
  report.http.push({ method: 'POST', path: '/api/showtimes/{fixture}/cancel', status: cancelResponse.status() });
  assert.equal(cancelResponse.status(), 200);
  const job = await cancelResponse.json();
  assert.equal(job.status, 'QUEUED');
  await desktop.getByText('Trạng thái: QUEUED', { exact: true }).waitFor({ timeout: 5000 });
  await desktop.screenshot({ path: resolve(evidence, 'int09-show-cancel-queued-desktop.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push('int09-show-cancel-queued-desktop.png');

  const buyerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const buyer = await login(buyerContext, fixture.buyerEmail, fixture.buyerPassword, '/account');
  const holdResult = await buyer.evaluate(async ({ showtimeId, seatId }) => {
    const response = await fetch(`/api/showtimes/${showtimeId}/holds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seatIds: [seatId] }) });
    return { status: response.status, body: await response.json() };
  }, { showtimeId: fixture.showtimeId, seatId: fixture.availableSeatId });
  report.http.push({ method: 'POST', path: '/api/showtimes/{fixture}/holds', status: holdResult.status, code: holdResult.body?.code ?? holdResult.body?.message });
  assert.equal(holdResult.status, 409);
  assert.equal(holdResult.body.code, 'SHOWTIME_CLOSED');
  await buyerContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await login(mobileContext, fixture.ownerEmail, fixture.ownerPassword, '/operations');
  await mobile.getByRole('heading', { name: 'Huỷ suất diễn' }).waitFor({ timeout: 15000 });
  await mobile.getByLabel('Suất diễn').selectOption(fixture.showtimeId);
  await mobile.waitForFunction((showtimeId) => document.querySelector('select')?.value === showtimeId && [...document.querySelectorAll('.operations-panel')].some((panel) => panel.textContent?.includes('Trạng thái: QUEUED')), fixture.showtimeId, { timeout: 20000 });
  const layout = await mobile.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  assert(layout.document <= layout.viewport + 2, `mobile operations overflow ${JSON.stringify(layout)}`);
  await mobile.screenshot({ path: resolve(evidence, 'int09-show-cancel-queued-mobile.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push('int09-show-cancel-queued-mobile.png');
  assert.equal(report.errors.length, 0);
  report.saleFreeze = { holdStatus: holdResult.status, holdCode: holdResult.body.code, jobStatus: job.status, mobileOverflow: false };
  writeFileSync(resolve(evidence, 'int09-show-cancel-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('INT-09 organizer UI queued a show cancellation; buyer hold was rejected after closure on an unsold fixture seat.');
  await desktopContext.close();
  await mobileContext.close();
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(evidence, 'int09-show-cancel-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
