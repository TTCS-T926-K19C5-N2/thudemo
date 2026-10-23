import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(`${process.cwd()}/apps/web/package.json`);
const { chromium } = require('playwright');
const out = new URL('.', import.meta.url);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [{ name: 'desktop', width: 1280, height: 720 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.locator('article').first().waitFor({ state: 'visible', timeout: 15000 });
    const search = viewport.name === 'mobile'
      ? page.getByPlaceholder('Tìm theo tên sự kiện, nghệ sĩ...')
      : page.getByPlaceholder('Tìm sự kiện, nghệ sĩ, địa điểm...');
    await search.fill('Bệnh sĩ');
    await search.press('Enter');
    const card = page.locator('article').filter({ hasText: 'Bệnh sĩ' }).first();
    await card.waitFor({ state: 'visible', timeout: 15000 });
    const href = await card.locator('a[href^="/shows/"]').first().getAttribute('href');
    if (!href) throw new Error(`No event detail link found for ${viewport.name}`);
    await page.goto(new URL(href, 'http://localhost:3000').toString(), { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /Bệnh sĩ/ }).first().waitFor({ state: 'visible', timeout: 15000 });
    const body = await page.locator('body').innerText();
    const result = {
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      detailPath: new URL(page.url()).pathname,
      expectedTitleVisible: body.includes('Bệnh sĩ'),
      venueVisible: body.includes('Nhà hát Kịch Việt Nam'),
      scheduleVisible: /\d{1,2}\/\d{1,2}\/2026/.test(body),
      priceVisible: /[\d.,]+\s*₫/.test(body),
      seatRouteLink: await page.locator('a[href$="/seats"]').count(),
      horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      pageErrors: errors,
    };
    if (!result.expectedTitleVisible || !result.venueVisible || !result.scheduleVisible || !result.priceVisible || result.seatRouteLink < 1 || result.horizontalOverflow || errors.length) throw new Error(`Event detail assertion failed: ${JSON.stringify(result)}`);
    await page.screenshot({ path: fileURLToPath(new URL(`r67-event-detail-${viewport.name}.png`, out)), fullPage: true });
    results.push(result);
    await context.close();
  }
} finally { await browser.close(); }
const output = { run: 'R67', profile: 's1demo-384da3d43b41', readOnly: true, providerCalls: false, results };
writeFileSync(new URL('r67-event-detail-browser.json', out), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output));
