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
assert.ok(fixture.secondGateId);
mkdirSync(evidenceDir, { recursive: true });
const report = { runId, environment: 'Authenticated Chromium against isolated local API/PostgreSQL; no camera/provider.', viewports: [], pageErrors: [], screenshots: [] };
let context;
try {
  for (const [name, viewport, ticket] of [
    ['desktop', { width: 1440, height: 1000 }, fixture.tickets[0]],
    ['mobile', { width: 390, height: 844 }, fixture.tickets[1]],
  ]) {
    const profileDir = resolve(cacheDir, `r19-duplicate-browser-profile-${name}`);
    context = await chromium.launchPersistentContext(profileDir, { headless: true, viewport, serviceWorkers: 'allow' });
    await context.addCookies([{ name: 'event_session', value: fixture.token, url: 'http://127.0.0.1:3410', expires: Math.floor(Date.now() / 1000) + 4 * 60 * 60, httpOnly: true, sameSite: 'Lax' }]);
    const page = context.pages()[0] ?? await context.newPage();
    const checkInStatuses = [];
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (response.request().method() === 'POST' && url.pathname.includes('/check-in')) checkInStatuses.push(response.status());
    });
    await page.goto('http://127.0.0.1:3410/scanner/snapshot', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Vào máy quét suất này' }).click();
    await page.goto(`http://127.0.0.1:3410/scanner?showtimeId=${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Tải cửa được phân công' }).click();
    const gate = page.getByLabel('Cửa hiện tại');
    await gate.waitFor();
    await gate.selectOption(fixture.gateId);
    await page.waitForFunction(() => !document.querySelector('#ticket-code')?.disabled);
    await page.getByLabel('Hoặc nhập mã vé').fill(ticket.qrPayload);
    await page.getByRole('button', { name: 'Kiểm tra vé' }).click();
    await page.getByTestId('ticket-scan-status').filter({ hasText: 'Vé hợp lệ. Check-in thành công.' }).waitFor({ timeout: 10000 });
    await gate.selectOption(fixture.secondGateId);
    await page.getByLabel('Hoặc nhập mã vé').fill(ticket.qrPayload);
    await page.getByRole('button', { name: 'Kiểm tra vé' }).click();
    await page.getByTestId('ticket-scan-status').filter({ hasText: 'Vé đã sử dụng' }).waitFor({ timeout: 10000 });
    const statusText = await page.getByTestId('ticket-scan-status').innerText();
    const entry = { viewport: `${viewport.width}x${viewport.height}`, ticketId: ticket.ticketId, checkInStatuses, showsPriorGate: statusText.includes('R19 Gate A'), showsPriorTime: /Đã vào lúc\s+\d{2}:\d{2}/.test(statusText), statusText };
    assert.deepEqual(checkInStatuses, [200, 409]);
    assert.equal(entry.showsPriorGate, true);
    assert.equal(entry.showsPriorTime, true);
    if (name === 'mobile') assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const screenshot = `r19-duplicate-at-second-gate-${name}.png`;
    await page.screenshot({ path: resolve(evidenceDir, screenshot), fullPage: true, animations: 'disabled' });
    report.screenshots.push(screenshot);
    {
      await page.getByRole('button', { name: 'Cho vào có ghi chú' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận cho vào' }).click();
      entry.overrideValidationBlocked = await page.getByText('Xác nhận đã kiểm tra chủ vé và nhập lý do từ 1 đến 500 ký tự.', { exact: true }).isVisible();
      assert.equal(entry.overrideValidationBlocked, true);
      entry.exceptionReason = 'Đã kiểm tra chủ vé trực tiếp tại cửa B.';
      await page.getByLabel('Lý do cho vào lại').fill(entry.exceptionReason);
      await page.getByLabel('Tôi đã xác nhận khách là chủ vé thật').check();
      const exceptionResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/check-in/exception'), { timeout: 15000 });
      await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận cho vào' }).click();
      entry.exceptionStatus = (await exceptionResponse).status();
      await page.getByText('Đã ghi nhận vào lại theo ngoại lệ', { exact: true }).waitFor({ timeout: 10000 });
      assert.equal(entry.exceptionStatus, 200);
      const overrideScreenshot = `r19-override-success-${name}.png`;
      await page.screenshot({ path: resolve(evidenceDir, overrideScreenshot), fullPage: true, animations: 'disabled' });
      report.screenshots.push(overrideScreenshot);
    }
    report.viewports.push(entry);
    await context.close();
    context = undefined;
  }
  assert.equal(report.pageErrors.length, 0);
  writeFileSync(resolve(evidenceDir, 'r19-duplicate-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`R19 duplicate browser check passed; evidence saved in ${evidenceDir}.`);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(evidenceDir, 'r19-duplicate-browser.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await context?.close();
}
