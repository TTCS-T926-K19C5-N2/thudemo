import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? ''))
  throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'evidence/ai-remediation', runId);
const fixturePath = resolve(
  root,
  '.cache/ai-remediation',
  runId,
  'cancellation-browser-fixture.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (fixture.runId !== runId) throw new Error('Fixture run-id mismatch');
const baseUrl = 'http://127.0.0.1:3410';
const orderUrl = `${baseUrl}/orders/${fixture.orderId}`;
const browser = await chromium.launch({ headless: true });
const results = {
  runId,
  orderId: fixture.orderId,
  desktop: {},
  mobile: {},
  errors: [],
};

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const desktop = await context.newPage();
  desktop.on('pageerror', (error) => results.errors.push(error.message));
  await desktop.goto(`${baseUrl}/login?returnTo=${encodeURIComponent(orderUrl)}`, {
    waitUntil: 'domcontentloaded',
  });
  await desktop.locator('input[type=email]').fill(fixture.buyerEmail);
  await desktop.locator('input[type=password]').fill(fixture.buyerPassword);
  await desktop.getByRole('button', { name: 'Đăng nhập' }).click();
  await desktop.waitForURL('**/account', { timeout: 15000 });
  await desktop.goto(orderUrl, { waitUntil: 'domcontentloaded' });
  await desktop.getByRole('heading', { name: 'Huỷ đơn và hoàn tiền' }).waitFor();

  const cancellationApi = `**/api/orders/${fixture.orderId}/cancellation`;
  await desktop.route(cancellationApi, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Synthetic isolated test outage' }),
    }),
  );
  await desktop.reload({ waitUntil: 'domcontentloaded' });
  const error = desktop.getByRole('alert').filter({ hasText: 'Synthetic isolated test outage' });
  await error.waitFor({ timeout: 10000 });
  await desktop.screenshot({
    path: resolve(evidence, 's45-cancellation-error-desktop.png'),
    fullPage: true,
  });
  await desktop.unroute(cancellationApi);

  await desktop.route(cancellationApi, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await desktop.reload({ waitUntil: 'domcontentloaded' });
  await desktop.getByRole('status').filter({ hasText: 'Đang kiểm tra điều kiện huỷ' }).waitFor({ timeout: 5000 });
  await desktop.screenshot({
    path: resolve(evidence, 's45-cancellation-loading-desktop.png'),
    fullPage: true,
  });
  await desktop.getByText('Số tiền hoàn giả lập:').waitFor({ timeout: 10000 });
  const previewText = await desktop.locator('.operations-panel').first().innerText();
  if (!previewText.includes('250.000'))
    throw new Error('Cancellation preview did not display the fixture refund amount.');
  await desktop.unroute(cancellationApi);
  await desktop.screenshot({
    path: resolve(evidence, 's45-cancellation-preview-desktop.png'),
    fullPage: true,
  });
  await desktop
    .getByLabel('Tôi xác nhận huỷ toàn bộ vé trong đơn; mã QR cũ sẽ không còn hiệu lực.')
    .check();
  await desktop.getByRole('button', { name: 'Huỷ đơn và hoàn tiền giả lập' }).click();
  await desktop
    .getByRole('status')
    .filter({ hasText: 'Trạng thái hoàn tiền giả lập:' })
    .waitFor({ timeout: 15000 });
  const successText = await desktop.locator('.operations-panel').first().innerText();
  if (!successText.includes('Trạng thái hoàn tiền giả lập:'))
    throw new Error('Cancellation result state was not visible after submit.');
  await desktop.screenshot({
    path: resolve(evidence, 's45-cancellation-result-desktop.png'),
    fullPage: true,
  });
  results.desktop = {
    login: true,
    errorState: true,
    delayedLoadingState: true,
    refundAmountVisible: true,
    confirmationRequired: true,
    cancellationResultVisible: true,
  };

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on('pageerror', (error) => results.errors.push(`mobile: ${error.message}`));
  await mobile.goto(orderUrl, { waitUntil: 'domcontentloaded' });
  await mobile.getByRole('heading', { name: 'Huỷ đơn và hoàn tiền' }).waitFor();
  await mobile
    .getByRole('status')
    .filter({ hasText: 'Trạng thái hoàn tiền giả lập:' })
    .waitFor({ timeout: 10000 });
  const mobileLayout = await mobile.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  if (mobileLayout.documentWidth > mobileLayout.viewportWidth + 2)
    throw new Error(`Mobile cancellation view overflows horizontally: ${JSON.stringify(mobileLayout)}`);
  await mobile.screenshot({
    path: resolve(evidence, 's45-cancellation-result-mobile.png'),
    fullPage: true,
  });
  results.mobile = { authenticatedSessionReused: true, resultVisible: true, ...mobileLayout };

  await writeFileSync(
    resolve(evidence, 's45-cancellation-browser.json'),
    JSON.stringify(results, null, 2),
  );
  if (results.errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
