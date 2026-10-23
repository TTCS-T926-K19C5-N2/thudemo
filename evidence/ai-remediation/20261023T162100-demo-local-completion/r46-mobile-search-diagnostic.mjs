import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(import.meta.dirname, '../../../apps/web/package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.locator('article').first().waitFor({ state: 'visible', timeout: 15000 });
const search = page.locator('.catalog-mobile-search input');
const before = await page.locator('body').innerText();
await search.fill('Số 186');
await page.waitForTimeout(1800);
const result = {
  viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
  searchVisible: await search.isVisible(),
  inputValue: await search.inputValue(),
  articleCount: await page.locator('article').count(),
  resultSummary: (await page.locator('body').innerText()).match(/Khám phá \d+ chương trình[^\n]*/) ?. [0] ?? null,
  targetVisible: await page.getByText('Hòa Nhạc Giao Hưởng VNSO Subscription Concert Số 186').count(),
  initialSummary: before.match(/Khám phá \d+ chương trình[^\n]*/) ?. [0] ?? null,
  overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
};
console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: resolve(import.meta.dirname, 'r46-mobile-search-diagnostic.png'), fullPage: true });
await context.close();
await browser.close();
