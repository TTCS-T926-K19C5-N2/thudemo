import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const stateDir = resolve(root, '.cache/ai-remediation', runId);
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const fixture = JSON.parse(readFileSync(resolve(stateDir, 's40-browser-fixture.json'), 'utf8'));
if (fixture.runId !== runId || fixture.users.length !== 3) throw new Error('Fixture ownership check failed');
const baseUrl = 'http://127.0.0.1:3410';
const result = { runId, baseUrl, views: [], errors: [] };
const browser = await chromium.launch({ headless: true });

async function openSeatPage(label, viewport, user, intercept) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await context.addCookies([{ name: 'event_session', value: user.token, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
  const page = await context.newPage();
  page.on('pageerror', (error) => result.errors.push(`${label}: ${error.message}`));
  if (intercept) await page.route(`**/api/showtimes/${fixture.showtimeId}/waiting-room`, intercept);
  const waitingResponse = page.waitForResponse((response) => response.url().includes(`/api/showtimes/${fixture.showtimeId}/waiting-room`), { timeout: 15000 });
  await page.goto(`${baseUrl}/shows/${fixture.showtimeId}/seats`, { waitUntil: 'domcontentloaded' });
  return { context, page, waitingResponse };
}

try {
  const desktop = await openSeatPage('desktop-admitted', { width: 1440, height: 1000 }, fixture.users[0], async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await desktop.page.getByRole('status').filter({ hasText: 'Đang kiểm tra lượt đặt vé' }).waitFor({ timeout: 5000 });
  await desktop.page.screenshot({ path: resolve(evidenceDir, 's40-waiting-loading-desktop.png'), fullPage: true });
  const desktopResponse = await desktop.waitingResponse;
  if (!desktopResponse.ok()) throw new Error(`Desktop waiting-room response ${desktopResponse.status()}`);
  await desktop.page.getByRole('heading', { name: 'Đến lượt đặt vé của bạn' }).waitFor({ timeout: 10000 });
  await desktop.page.screenshot({ path: resolve(evidenceDir, 's40-waiting-admitted-desktop.png'), fullPage: true });
  result.views.push({ viewport: 'desktop', loadingStateVisible: true, state: 'admitted', headingVisible: true, leaseTextVisible: await desktop.page.getByText(/Lượt có hiệu lực đến/).isVisible() });

  const mobile = await openSeatPage('mobile-queued', { width: 390, height: 844 }, fixture.users[1]);
  const mobileResponse = await mobile.waitingResponse;
  if (!mobileResponse.ok()) throw new Error(`Mobile waiting-room response ${mobileResponse.status()}`);
  await mobile.page.getByRole('heading', { name: 'Bạn đang ở phòng chờ' }).waitFor({ timeout: 10000 });
  await mobile.page.getByText('Vị trí hiện tại: 1. Giữ trang mở để duy trì vị trí.').waitFor({ timeout: 5000 });
  await mobile.page.screenshot({ path: resolve(evidenceDir, 's40-waiting-queued-mobile.png'), fullPage: true });
  const width = await mobile.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  result.views.push({ viewport: 'mobile', state: 'queued', position: 1, visible: true, width, noHorizontalOverflow: width.scroll <= width.client });

  const error = await openSeatPage('waiting-room-error', { width: 1440, height: 1000 }, fixture.users[2], async (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Phòng chờ tạm thời chưa sẵn sàng. Hãy thử lại.' }) }));
  await error.waitingResponse;
  await error.page.getByRole('alert').filter({ hasText: 'Phòng chờ tạm thời chưa sẵn sàng' }).waitFor({ timeout: 10000 });
  await error.page.screenshot({ path: resolve(evidenceDir, 's40-waiting-error-desktop.png'), fullPage: true });
  result.errorState = { visible: true, source: 'browser-intercepted HTTP 503; API/Redis error state display only' };

  if (result.errors.length) throw new Error(`Browser page errors: ${result.errors.join('; ')}`);
  writeFileSync(resolve(evidenceDir, 's40-waiting-room-browser.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
