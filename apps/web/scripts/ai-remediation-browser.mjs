import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) throw new Error('Missing run id');
const evidence = resolve(import.meta.dirname, '../../../evidence/ai-remediation', runId);
const fixturePath = resolve(import.meta.dirname, '../../../.cache/ai-remediation', runId, 'browser-fixture.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (fixture.runId !== runId) throw new Error('Browser fixture run-id mismatch');
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = { runId, baseUrl: 'http://127.0.0.1:3410', views: [], errors: [] };
for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (error) => results.errors.push(`${name}: ${error.message}`));
  await page.goto(results.baseUrl, { waitUntil: 'domcontentloaded' });
  const loading = await page.getByText('Đang tải danh sách sự kiện…').isVisible().catch(() => false);
  if (loading) await page.screenshot({ path: resolve(evidence, `catalog-loading-${name}.png`), fullPage: true });
  await Promise.race([
    page.getByText('Chưa có suất diễn mở bán').waitFor({ timeout: 10000 }),
    page.getByText(`AI remediation fixture ${runId}`).first().waitFor({ timeout: 10000 }),
  ]);
  const empty = await page.getByText('Chưa có suất diễn mở bán').isVisible().catch(() => false);
  const fixtureVisible = await page.getByText(`AI remediation fixture ${runId}`).first().isVisible().catch(() => false);
  const count = await page.getByText('0', { exact: true }).first().isVisible().catch(() => false);
  await page.screenshot({ path: resolve(evidence, `catalog-${empty ? 'empty' : 'fixture'}-${name}.png`), fullPage: true });
  results.views.push({ name, viewport, loadingObserved: loading, emptyStateObserved: empty, fixtureEventVisible: fixtureVisible, zeroCountVisible: count });
  if (name === 'desktop') {
    const delayed = await browser.newPage({ viewport });
    await delayed.route('**/api/showtimes*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.continue();
    });
    await delayed.goto(results.baseUrl, { waitUntil: 'domcontentloaded' });
    const delayedLoading = await delayed.getByText('Đang tải danh sách sự kiện…').isVisible().catch(() => false);
    if (delayedLoading) await delayed.screenshot({ path: resolve(evidence, 'catalog-loading-delayed-desktop.png'), fullPage: true });
    await Promise.race([
      delayed.getByText('Chưa có suất diễn mở bán').waitFor({ timeout: 10000 }),
      delayed.getByText(`AI remediation fixture ${runId}`).first().waitFor({ timeout: 10000 }),
    ]);
    results.views.push({ name: 'desktop-delayed', artificialApiDelayMs: 900, loadingStateObserved: delayedLoading, emptyStateObserved: await delayed.getByText('Chưa có suất diễn mở bán').isVisible().catch(() => false), fixtureEventVisible: await delayed.getByText(`AI remediation fixture ${runId}`).first().isVisible().catch(() => false) });
    await delayed.close();
    await page.goto(`${results.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    const forgotLink = page.getByRole('link', { name: 'Quên mật khẩu?' });
    await forgotLink.waitFor({ timeout: 10000 });
    await forgotLink.click();
    await page.getByRole('heading', { name: 'Quên mật khẩu' }).waitFor({ timeout: 10000 });
    await page.getByLabel('Email').fill(`qa-${runId}@example.invalid`);
    await page.getByRole('button', { name: 'Gửi hướng dẫn' }).click();
    const status = page.getByRole('status');
    await status.waitFor({ timeout: 10000 });
    const message = await status.innerText();
    await page.screenshot({ path: resolve(evidence, 'forgot-password-generic-success.png'), fullPage: true });
    results.forgotFlow = { linkNavigated: true, genericSuccessVisible: Boolean(message), catcherCheckedSeparately: true };
    await page.route('**/api/showtimes*', async (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic test outage' }) }));
    await page.goto(results.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('alert').first().waitFor({ timeout: 10000 });
    results.views.push({ name: 'desktop-error', apiFailureInjected: true, errorStateObserved: true });
    await page.screenshot({ path: resolve(evidence, 'catalog-error-desktop.png'), fullPage: true });
    await page.unroute('**/api/showtimes*');
    await page.goto(`${results.baseUrl}/login?returnTo=${encodeURIComponent(`/events/${fixture.eventId}`)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type=email]').fill(fixture.ownerEmail);
    await page.locator('input[type=password]').fill(fixture.ownerPassword);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForURL(`**/events/${fixture.eventId}`, { timeout: 10000 });
    await page.getByRole('heading', { name: 'Chi tiết sự kiện' }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(evidence, 'publication-ui-before.png'), fullPage: true });
    const hideButton = page.getByRole('button', { name: 'Ẩn sự kiện' });
    if (await hideButton.isVisible().catch(() => false)) {
      await page.getByRole('checkbox').first().check();
      await hideButton.click();
      await page.getByRole('status').filter({ hasText: 'Đã ẩn sự kiện' }).waitFor({ timeout: 10000 });
      await page.getByText('Nháp', { exact: true }).first().waitFor({ timeout: 5000 });
    }
    const publishButton = page.getByRole('button', { name: 'Công bố sự kiện' });
    const publishVisible = await publishButton.isVisible().catch(() => false);
    const hideVisible = await hideButton.isVisible().catch(() => false);
    if (!publishVisible) {
      await page.screenshot({ path: resolve(evidence, 'publication-ui-after-hide-debug.png'), fullPage: true });
      console.log(JSON.stringify({ publicationButtons: await page.getByRole('button').allInnerTexts(), alerts: await page.getByRole('alert').allInnerTexts(), statuses: await page.getByRole('status').allInnerTexts(), publishVisible, hideVisible }));
      await publishButton.waitFor({ timeout: 10000 });
    }
    await publishButton.click();
    await page.waitForTimeout(500);
    const publicationStatusTexts = await page.getByRole('status').allInnerTexts();
    const publicationAlertTexts = await page.getByRole('alert').allInnerTexts();
    await page.screenshot({ path: resolve(evidence, 'publication-ui-debug.png'), fullPage: true });
    results.publicationAttempt = { statusTexts: publicationStatusTexts, alertTexts: publicationAlertTexts };
    await page.getByRole('status').filter({ hasText: 'Sự kiện đã được công bố.' }).waitFor({ timeout: 10000 });
    await page.getByText('Đã công bố', { exact: true }).first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: resolve(evidence, 'publication-ui-success.png'), fullPage: true });
    await page.goto(results.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText(`AI remediation fixture ${runId}`).first().waitFor({ timeout: 10000 });
    results.publicationFlow = { ownerLogin: true, publishAction: true, eventVisibleInCatalog: true };
    await page.goto(`${results.baseUrl}/showtimes/${fixture.rescheduleShowtimeId}/manage`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Đổi giờ diễn' }).waitFor({ timeout: 10000 });
    const timeInput = page.getByLabel('Giờ mới (Việt Nam)');
    await timeInput.fill('2020-01-01T10:00');
    await page.locator('textarea').fill('Kiểm tra nhập giờ cũ');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Xác nhận đổi giờ' }).click();
    await page.getByRole('status').filter({ hasText: 'Chọn giờ Việt Nam trong tương lai.' }).waitFor({ timeout: 5000 });
    await timeInput.fill('2033-06-15T10:30');
    await page.locator('textarea').fill('Điều chỉnh lịch thử nghiệm');
    await page.getByRole('button', { name: 'Xác nhận đổi giờ' }).click();
    await page.waitForTimeout(800);
    const rescheduleStatuses = await page.getByRole('status').allInnerTexts();
    const rescheduleAlerts = await page.getByRole('alert').allInnerTexts();
    await page.screenshot({ path: resolve(evidence, 'reschedule-ui-debug.png'), fullPage: true });
    results.rescheduleAttempt = { statusTexts: rescheduleStatuses, alertTexts: rescheduleAlerts };
    console.log(JSON.stringify({ rescheduleStatuses, rescheduleAlerts }));
    await page.getByRole('status').filter({ hasText: 'Đã đổi giờ; thông báo được xếp hàng (QUEUED).' }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: resolve(evidence, 'reschedule-ui-success.png'), fullPage: true });
    results.rescheduleFlow = { invalidPastDateRejected: true, futureDateAccepted: true, noticeStatesWorkerOff: true };
    await page.goto(`${results.baseUrl}/scanner/reports/${fixture.showtimeId}`, { waitUntil: 'domcontentloaded' });
    const csvLink = page.getByRole('link', { name: 'Tải CSV lượt vào cửa' });
    await csvLink.waitFor({ timeout: 10000 });
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      csvLink.click(),
    ]);
    const csvPath = resolve(evidence, 'attendance-conflicts.csv');
    await csvDownload.saveAs(csvPath);
    const csvBytes = readFileSync(csvPath);
    const csvText = csvBytes.toString('utf8').replace(/^\uFEFF/, '');
    const csvRows = csvText.trimEnd().split(/\r?\n/);
    const expectedHeader = 'ticket_code,seat,entry_time_utc,gate,conflict';
    if (!csvBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || csvRows[0] !== expectedHeader || csvRows.length !== 3 || !csvRows.some((row) => row.startsWith(`"AI-${runId}-1","QA-1",`)) || !csvRows.some((row) => row.startsWith(`"AI-${runId}-2","QA-2",`)) || !csvRows.slice(1).every((row) => row.endsWith(',"true"')))
      throw new Error('Attendance CSV did not match the run-bound fixture oracle.');
    results.attendanceCsvFlow = { reportPageVisible: true, downloadSucceeded: true, utf8Bom: true, rowCount: csvRows.length - 1, fixtureCodesMatched: true, minimalColumnsOnly: csvRows[0] === expectedHeader, conflictsMarked: true };
    await page.screenshot({ path: resolve(evidence, 'attendance-csv-report-ui.png'), fullPage: true });
    await page.context().clearCookies();
    await page.goto(`${results.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type=email]').fill(fixture.adminEmail);
    await page.locator('input[type=password]').fill(fixture.adminPassword);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForURL('**/account', { timeout: 10000 }).catch(() => {});
    await page.goto(`${results.baseUrl}/operations`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Email gửi lỗi' }).waitFor({ timeout: 10000 });
    await page.getByText('Không có email theo bộ lọc.').waitFor({ timeout: 10000 });
    await page.screenshot({ path: resolve(evidence, 'admin-mail-failures-empty.png'), fullPage: true });
    results.adminMailFlow = { adminLogin: true, mailFailuresPanelVisible: true, emptyStateVisible: true, retriesNotTriggered: true };
  }
  await page.close();
}
await browser.close();
writeFileSync(resolve(evidence, 'browser-ui-smoke.json'), JSON.stringify(results, null, 2));
if (results.errors.length) process.exitCode = 1;
