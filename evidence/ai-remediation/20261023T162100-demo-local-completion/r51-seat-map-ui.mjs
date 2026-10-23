import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs';

const config = JSON.parse(fs.readFileSync('D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json', 'utf8'));
const buyer = config.accounts.find((account) => account.name === 'buyer' && account.roles.includes('BUYER'));
if (!buyer) throw new Error('Synthetic BUYER account unavailable');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('http://localhost:3000/shows/914556a8-ba19-4766-9e20-00a3d93df432/seats', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).pathname === '/login') {
    await page.getByLabel('Email').fill(buyer.email);
    await page.getByLabel('Mật khẩu').fill(buyer.password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForURL((url) => url.pathname.endsWith('/seats'), { timeout: 15000 });
  }
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const text = await page.locator('body').innerText();
  const result = {
    viewport: '1280x900',
    route: new URL(page.url()).pathname,
    title: await page.title(),
    loginReached: new URL(page.url()).pathname.endsWith('/seats'),
    seatControls: await page.locator('[data-seat-id], [data-testid*=seat], button[aria-label*=ghế]').count(),
    seatTextCount: (text.match(/\b(?:A|B|C|D|E)-\d+\b/g) || []).length,
    showsSeatLegend: /trống|đang giữ|đã bán/i.test(text),
    hasPaymentOrOrder: /thanh toán|đặt vé/i.test(text),
    visibleErrors: errors,
    screenshot: 'r51-seat-map-ui-desktop.png',
  };
  await page.screenshot({ path: fileURLToPath(new URL(result.screenshot, import.meta.url)), fullPage: true });
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
