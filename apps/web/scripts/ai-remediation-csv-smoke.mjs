import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'evidence/ai-remediation', runId);
const fixture = JSON.parse(readFileSync(resolve(root, '.cache/ai-remediation', runId, 'browser-fixture.json'), 'utf8'));
if (fixture.runId !== runId) throw new Error('Fixture run-id mismatch');
function parseCsvLine(line) {
  const values = [];
  let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  if (quoted) throw new Error('Unclosed CSV quote');
  return values;
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => { throw error; });
  await page.goto('http://127.0.0.1:3410/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(fixture.ownerEmail);
  await page.locator('input[type=password]').fill(fixture.ownerPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/account', { timeout: 10000 }).catch(() => {});
  await page.goto(`http://127.0.0.1:3410/scanner/reports/${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Tải CSV lượt vào cửa' }).waitFor({ timeout: 10000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Tải CSV lượt vào cửa' }).click()]);
  const path = resolve(evidence, 'attendance-conflicts.csv');
  await download.saveAs(path);
  const bytes = readFileSync(path);
  const csv = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const rows = csv.trimEnd().split(/\r?\n/).map(parseCsvLine);
  const header = 'ticket_code,seat,entry_time_utc,gate,conflict';
  if (!bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || rows[0].join(',') !== header || rows.length !== 3) throw new Error('CSV header, BOM, or row count mismatch');
  const records = rows.slice(1);
  if (!records.some((row) => row[0] === `AI-${runId}-1` && row[1] === 'QA-1' && row[3] === 'Cửa Đông' && row[4] === 'true') || !records.some((row) => row[0] === `AI-${runId}-2` && row[1] === 'QA-2' && row[3] === 'Cửa Tây' && row[4] === 'true')) throw new Error('CSV fixture oracle mismatch');
  const result = { runId, reportPage: true, downloaded: true, utf8Bom: true, header, dataRows: rows.length - 1, expectedCodes: true, conflictsMarked: true, piiColumns: false };
  writeFileSync(resolve(evidence, 'attendance-csv-browser.json'), JSON.stringify(result, null, 2));
  await page.screenshot({ path: resolve(evidence, 'attendance-csv-report-ui.png'), fullPage: true });
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
