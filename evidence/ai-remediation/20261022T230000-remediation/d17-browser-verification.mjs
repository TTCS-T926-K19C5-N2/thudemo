import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (runId !== '20261022T230000-remediation') throw new Error('Unexpected remediation run id');
const evidence = import.meta.dirname;
const require = createRequire(resolve(evidence, '../../../apps/web/package.json'));
const { chromium } = require('playwright');
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const outputs = [];
const orderId = '11111111-1111-4111-8111-111111111111';
const fixtureOrder = {
  id: orderId, status: 'PENDING', rawStatus: 'PENDING', totalAmount: 10000,
  subtotalAmount: 10000, discountAmount: 0, couponCode: null,
  expiresAt: '2099-01-01T00:00:00.000Z', serverTime: new Date().toISOString(),
  remainingSeconds: 600, isExpired: false, createdAt: new Date().toISOString(),
  event: { id: 'event-fixture', name: 'D17 synthetic event', description: '', location: 'Local test' },
  showtime: { id: 'show-fixture', startTime: '2099-01-01T00:00:00.000Z' },
  items: [{ id: 'item-fixture', seatId: 'seat-fixture', row: 'A', seatNumber: 1, label: 'A-1', tierName: 'Standard', unitPrice: 10000 }],
};
for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const requests = [];
  let paymentInitiated = false;
  page.on('pageerror', (error) => requests.push({ kind: 'pageerror', message: error.message }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'buyer-fixture', email: 'buyer@example.invalid', roles: ['BUYER'] }) }));
  await page.route(`**/api/orders/${orderId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paymentInitiated ? { ...fixtureOrder, latestPayment: { id: 'payment-fixture', status: 'INITIATED', attemptNo: 1, amount: 10000, gateway: 'mock' } } : fixtureOrder) }));
  await page.route(`**/api/orders/${orderId}/pay`, async (route) => {
    if (route.request().method() === 'POST') {
      paymentInitiated = true;
      requests.push({ method: 'POST', path: '/api/orders/<fixture>/pay', syntheticResponse: '502 PAYMENT_OUTCOME_UNKNOWN' });
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ code: 'PAYMENT_OUTCOME_UNKNOWN', message: 'Chưa xác định được kết quả khởi tạo.' }) });
    } else await route.continue();
  });
  await page.goto(`http://127.0.0.1:3410/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
  const pay = page.getByRole('button', { name: 'Thanh toán ngay' });
  await pay.waitFor({ timeout: 10000 });
  await pay.click();
  await page.getByText('Chưa xác định được kết quả khởi tạo. Đang chờ đối soát; vui lòng không thanh toán lại.').waitFor({ timeout: 10000 });
  const retry = page.getByRole('button', { name: 'Đang chờ đối soát' });
  await retry.waitFor({ timeout: 5000 });
  const disabled = await retry.isDisabled();
  const postCount = requests.filter((item) => item.method === 'POST').length;
  await page.screenshot({ path: resolve(evidence, `d17-payment-unknown-${name}.png`), fullPage: true });
  outputs.push({ name, viewport, unknownResultMessageVisible: true, retryButtonDisabled: disabled, paymentPostCount: postCount, pageErrors: requests.filter((item) => item.kind === 'pageerror').length });
  await context.close();
  if (!disabled || postCount !== 1 || requests.some((item) => item.kind === 'pageerror')) throw new Error(`${name} browser assertion failed`);
}
await browser.close();
writeFileSync(resolve(evidence, 'd17-browser-verification.json'), JSON.stringify({ runId, build: 'current local standalone web build', apiBoundary: 'synthetic route interception for unknown outcome; API behavior separately verified by isolated PostgreSQL E2E', outputs }, null, 2));
