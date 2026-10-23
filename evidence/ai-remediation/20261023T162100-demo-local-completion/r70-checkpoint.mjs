import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const id = 'DEMO-CURRENT-SOURCE-FULL-REGRESSION-01';
const evidence = ['r70-api-full-regression.log', 'r70-api-full-regression.log.exitcode', 'r70-web-full-regression.log', 'r70-web-full-regression.log.exitcode', 'r70-deployment-full-regression.log', 'r70-deployment-full-regression.log.exitcode', 'r60-web-typecheck.log', 'r60-web-lint.log', 'r65-restart-status.log'];
const results = read('results.json');
if (!results.some((x) => x.id === id)) results.push({
  id, requirement_id: ['E-01', 'E-02', 'E-03', 'E-04'], kind: 'SUPPLEMENTAL_REGRESSION', group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Current source regression checkpoint; does not replace end-to-end acceptance rows' }, original_requirement: null,
  expected: ['Current API/web/deployment test suites pass without skipped/flaky tests; built source starts on isolated demo profile.'],
  baseline_status: 'NOT_RUN', status: 'PASS',
  actual: 'After R65 rebuilt and installed current prepared source, full API suite passed 61 files/481 tests, web suite 29 files/168 tests, deployment/laptop suite 20 tests. All exits 0; logs show zero failed/skipped/cancelled/todo. API/web suites used maxWorkers=1. Official local demo launcher Status remained READY; source focused typecheck and ESLint passed after R60. This does not close the 90 remaining source Ready/Must acceptance assertions or the separate blocked PostgreSQL harness.',
  evidence_files: evidence, source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R70')) progress.push({ id: 'R70', title: 'Full regression on current prepared source before handoff checkpoint', dependencies: ['R69'], status: 'VERIFIED', actual: 'Current-source API 61/481, web 29/168 and deployment/laptop 20/20 passed with exit code 0 and no skips. Current source build was made by official R65 Restart; focused typecheck/lint passed for the R60 component change. Functional acceptance coverage remains incomplete, so this is a regression pass only.', evidence });
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R70';
manifest.verification = { ...manifest.verification, r70FullRegression: { api: '61 files/481 tests PASS', web: '29 files/168 tests PASS', deploymentLaptop: '20 PASS', skipped: 0, currentSourceBuild: 'R65 official Restart', focusedTypecheck: 'PASS', focusedLint: 'PASS' } };
manifest.supplementalResults = { rows: 16, PASS: 15, BLOCKED: 1 };
write('run-manifest.json', manifest);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R69', '# Báo cáo kiểm tra local demo — R70');
report = report.replace('## Checkpoint mới nhất · R69', '## Checkpoint mới nhất · R70');
report = report.replace('Supplemental rows: 15.', 'Supplemental rows: 16. R70 is the full regression on current prepared source.');
report = report.replace('Combined results: 515; PASS 176, FAIL 0, NOT_RUN 326, BLOCKED 7, NEEDS_DECISION 5, MISSING 1.', 'Combined results: 516; PASS 177, FAIL 0, NOT_RUN 326, BLOCKED 7, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 48 | 34 | 0 | 13 | 1 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 49 | 35 | 0 | 13 | 1 | 0 | 0 | 0 |');
report = report.replace('- R69: harness PostgreSQL riêng', '- R70: full regression sau khi source mới được build/chạy: API 61 files/481 tests, web 29 files/168 tests, deployment/laptop 20 tests PASS; không fail/skip. Focused typecheck/lint R60 PASS; official Restart build R65 và Status READY. Đây là regression, không lấp các ca acceptance còn NOT_RUN/BLOCKED.\n- R69: harness PostgreSQL riêng');
report = report.replace('tiến độ R43–R69 ở `progress.json`', 'tiến độ R43–R70 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R70', rows: results.length, progress: progress.length }));
