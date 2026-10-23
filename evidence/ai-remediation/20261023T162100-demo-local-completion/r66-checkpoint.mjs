import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const id = 'DEMO-CATALOG-RUNTIME-RESTART-01';
const evidence = ['r65-catalog-browser.json', 'r65-search-desktop.png', 'r65-search-mobile.png', 'r65-location-desktop.png', 'r65-location-mobile.png', 'r65-profile-oracle.json', 'r65-restart-status.log'];
const results = read('results.json');
if (!results.some((x) => x.id === id)) results.push({
  id, requirement_id: ['S-08', 'E-01'], kind: 'SUPPLEMENTAL_DEMO', group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Current runtime retest; supplemental to source inventory' }, original_requirement: null,
  expected: ['After official profile restart, catalog is usable on desktop/mobile and retained catalog/order/ticket counts match the isolated DB oracle.'],
  baseline_status: 'NOT_RUN', status: 'PASS',
  actual: 'R65 post-rebuild Chromium desktop 1280×720 and mobile 390×844: catalog loaded; cross-page search found Số 186; Bắc Ninh filter returned two; price sort monotonic across 43 loaded showtimes; no page errors or horizontal overflow. Read-only PostgreSQL after restart: 40 events/44 showtimes/5 orders/5 tickets; exact rehearsal showtime remains ON_SALE. No DB writes/provider calls in this catalog check.',
  evidence_files: evidence, source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
const r65 = progress.find((x) => x.id === 'R65');
if (r65) r65.actual = `${r65.actual} Read-only post-restart oracle confirmed 40 events/44 showtimes/5 orders/5 tickets and exact rehearsal showtime ON_SALE; R65 desktop/mobile catalog search/filter/sort smoke also passed.`;
if (!progress.some((x) => x.id === 'R66')) progress.push({ id: 'R66', title: 'Current post-restart catalog desktop/mobile smoke and persistence oracle', dependencies: ['R65'], status: 'VERIFIED', actual: 'Fresh Chromium contexts after current source restart checked catalog search/filter/sort at desktop and mobile viewports, no JS errors/overflow. Read-only PostgreSQL confirms catalog and order/ticket counts survived. No write/provider call.', evidence });
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R66';
manifest.verification = { ...manifest.verification, r66CatalogPostRestart: 'PASS; desktop/mobile browser, read-only DB persistence oracle' };
manifest.supplementalResults = { rows: 13, PASS: 13 };
write('run-manifest.json', manifest);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R65', '# Báo cáo kiểm tra local demo — R66');
report = report.replace('## Checkpoint mới nhất · R65', '## Checkpoint mới nhất · R66');
report = report.replace('Supplemental rows: 12.', 'Supplemental rows: 13. R66 adds a post-restart catalog browser/retention smoke.');
report = report.replace('Combined results: 512; PASS 174, FAIL 0, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.', 'Combined results: 513; PASS 175, FAIL 0, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 45 | 32 | 0 | 13 | 0 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 46 | 33 | 0 | 13 | 0 | 0 | 0 | 0 |');
report = report.replace('Source Ready/Must still has 90 non-PASS assertions;', 'Source Ready/Must still has 90 non-PASS assertions;');
report = report.replace('- BUG-R46-01', '- R66: sau khi build/restart, browser desktop+mobile kiểm lại catalog; search xuyên trang thấy Số 186, lọc Bắc Ninh còn 2 suất, sort tăng dần đủ 43; không JS error/tràn ngang. Oracle PostgreSQL giữ 40 sự kiện/44 suất/5 đơn/5 vé và rehearsal ON_SALE.\n- BUG-R46-01');
report = report.replace('tiến độ R43–R65 ở `progress.json`', 'tiến độ R43–R66 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R66', results: results.length, progress: progress.length }));
