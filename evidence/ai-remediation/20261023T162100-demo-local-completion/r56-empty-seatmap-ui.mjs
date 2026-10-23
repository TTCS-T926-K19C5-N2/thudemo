import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const webRequire = createRequire(`${process.cwd()}/apps/web/package.json`);
const { chromium } = webRequire('playwright');
const showtimeId = 'f66556a1-e3f7-4f9e-a4bd-8e4298e2e772';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const responses = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.name));
  page.on('response', (r) => { const p = new URL(r.url()).pathname; if (p.includes(`/api/showtimes/${showtimeId}`)) responses.push({ path: p, status: r.status() }); });
  await page.goto(`http://localhost:3000/shows/${showtimeId}/seats`, { waitUntil: 'domcontentloaded' });
  let visibleClosedMessage = false;
  try {
    await page.getByText('Suất diễn chưa mở bán hoặc đã đóng.', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    visibleClosedMessage = true;
  } catch {}
  const result = {
    run: 'R56', showtimeId, viewport: '1280x900',
    visibleClosedMessage: (await page.locator('body').innerText()).includes('Suất diễn chưa mở bán hoặc đã đóng.'),
    bodyText: (await page.locator('body').innerText()).slice(0, 1200),
    emptySeatGridRendered: await page.locator('canvas[role="application"]').count() > 0,
    loginRedirected: new URL(page.url()).pathname === '/login',
    relevantHttp: responses,
    pageErrors: errors,
    screenshot: 'r56-empty-seatmap-ui.png',
    dbOracle: 'r55-showtime-map-inventory.json',
  };
  await page.screenshot({ path: fileURLToPath(new URL(result.screenshot, import.meta.url)), fullPage: true });
  writeFileSync(fileURLToPath(new URL('r56-empty-seatmap-ui.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
