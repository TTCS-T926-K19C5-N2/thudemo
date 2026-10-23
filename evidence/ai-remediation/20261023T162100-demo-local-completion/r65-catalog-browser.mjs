import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(resolve(import.meta.dirname, '../../../apps/web/package.json'));
const { chromium } = require('playwright');
const out = import.meta.dirname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const record = {
  runId: '20261023T162100-demo-local-completion-R65',
  checkedAt: new Date().toISOString(),
  profile: 's1demo-384da3d43b41',
  runtimeBuild: 'R65 current prepared source after official Restart',
  databaseWrites: false,
  providerCalls: false,
  viewports: {},
};

async function pageFor(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  return { context, page, pageErrors };
}

async function settleCatalog(page) {
  await page.locator('article').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText(/\d+ kết quả trong \d+ suất đã tải/).first().waitFor({ timeout: 15000 });
}

const desktop = await pageFor({ width: 1280, height: 720 });
try {
  await settleCatalog(desktop.page);
  const headerSearch = desktop.page.getByPlaceholder('Tìm sự kiện, nghệ sĩ, địa điểm...');
  assert.equal(await headerSearch.isVisible(), true);
  assert.equal(await headerSearch.isEnabled(), true);
  await headerSearch.fill('Số 186');
  await headerSearch.press('Enter');
  await desktop.page.waitForURL(/\?q=/);
  await desktop.page.getByText('Hòa Nhạc Giao Hưởng VNSO Subscription Concert Số 186').first().waitFor({ timeout: 15000 });
  await assert.doesNotReject(async () => assert.match(await desktop.page.locator('body').innerText(), /1 kết quả trong 43 suất đã tải/));
  await desktop.page.screenshot({ path: resolve(out, 'r65-search-desktop.png'), fullPage: true });
  record.viewports.desktop = {
    width: 1280,
    height: 720,
    headerSearch: 'visible and enabled',
    crossPageSearch: 'PASS: Số 186 found after loading 43/43 cursor results; one matching result',
  };

  await desktop.page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await settleCatalog(desktop.page);
  await desktop.page.locator('select[aria-label="Lọc theo địa điểm"]').selectOption({ label: 'Bắc Ninh' });
  await desktop.page.getByText(/2 kết quả trong 43 suất đã tải/).first().waitFor({ timeout: 15000 });
  const locationText = await desktop.page.locator('article').allInnerTexts();
  assert.equal(locationText.length, 2);
  assert.ok(locationText.every((text) => text.includes('Bắc Ninh')));
  await desktop.page.screenshot({ path: resolve(out, 'r65-location-desktop.png'), fullPage: true });
  record.viewports.desktop.locationFilter = 'PASS: 2 Bắc Ninh results after loading all 43 cursor results';

  await desktop.page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await settleCatalog(desktop.page);
  await desktop.page.locator('select[aria-label="Sắp xếp sự kiện"]').selectOption({ label: 'Giá thấp trước' });
  await desktop.page.waitForFunction(() => document.querySelectorAll('article').length === 43, null, { timeout: 15000 });
  const prices = await desktop.page.locator('article').evaluateAll((cards) => cards.map((card) => {
    const amounts = [...card.innerText.matchAll(/([\d.,]+)\s*₫/g)].map((match) => Number(match[1].replace(/[^0-9]/g, '')));
    return amounts.length ? Math.min(...amounts) : null;
  }));
  assert.equal(prices.length, 43);
  assert.ok(prices.every((price) => Number.isFinite(price)));
  assert.ok(prices.every((price, index) => index === 0 || prices[index - 1] <= price));
  record.viewports.desktop.priceSort = { resultCount: 43, minPricesMonotonicAscending: true, first: prices[0], last: prices.at(-1) };
  record.viewports.desktop.pageErrors = desktop.pageErrors;
  assert.deepEqual(desktop.pageErrors, []);
} finally {
  await desktop.context.close();
}

const mobile = await pageFor({ width: 390, height: 844 });
try {
  await settleCatalog(mobile.page);
  assert.equal(await mobile.page.evaluate(() => innerWidth), 390);
  const searchField = await mobile.page.locator('input').evaluateAll((inputs) => inputs.map((input) => input.placeholder));
  const mobileSearch = mobile.page.locator('.catalog-mobile-search input');
  assert.ok(await mobileSearch.isVisible(), `Mobile catalog search missing: ${searchField.join(' | ')}`);
  await mobileSearch.fill('Số 186');
  await mobile.page.getByText('Hòa Nhạc Giao Hưởng VNSO Subscription Concert Số 186').first().waitFor({ timeout: 15000 });
  await assert.doesNotReject(async () => assert.match(await mobile.page.locator('body').innerText(), /1 kết quả trong 43 suất đã tải/));
  await mobile.page.screenshot({ path: resolve(out, 'r65-search-mobile.png'), fullPage: true });
  await mobile.page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await settleCatalog(mobile.page);
  await mobile.page.locator('select[aria-label="Lọc theo địa điểm"]').selectOption({ label: 'Bắc Ninh' });
  await mobile.page.getByText(/2 kết quả trong 43 suất đã tải/).first().waitFor({ timeout: 15000 });
  assert.ok((await mobile.page.locator('article').allInnerTexts()).every((text) => text.includes('Bắc Ninh')));
  await mobile.page.screenshot({ path: resolve(out, 'r65-location-mobile.png'), fullPage: true });
  const mobileOverflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  record.viewports.mobile = { width: 390, height: 844, search: 'PASS: cross-page result found', locationFilter: 'PASS: two Bắc Ninh results after loading all 43', horizontalOverflow: mobileOverflow, pageErrors: mobile.pageErrors };
  assert.equal(mobileOverflow, false);
  assert.deepEqual(mobile.pageErrors, []);
} finally {
  await mobile.context.close();
  await browser.close();
}

writeFileSync(resolve(out, 'r65-catalog-browser.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record, null, 2));
