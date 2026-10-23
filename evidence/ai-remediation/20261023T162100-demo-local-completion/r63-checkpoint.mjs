import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const id = 'DEMO-OFFLINE-CHECKIN-UNIT-01';
const evidence = ['r63-offline-checkin-unit.log', 'r63-offline-checkin-unit.log.exitcode', 'r63-offline-checkin-web-unit.log', 'r63-offline-checkin-web-unit.log.exitcode'];
const results = read('results.json');
if (!results.some((x) => x.id === id)) results.push({
  id, requirement_id: ['S-30', 'S-31', 'S-32', 'S-33', 'S-34'], kind: 'SUPPLEMENTAL_UNIT',
  group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Kiểm tra hồi quy bổ sung; không thay thế acceptance case trong inventory' }, original_requirement: null,
  expected: ['Offline scanner/admission/check-in focused API and web unit suites pass; not a substitute for browser, DB, device, camera, or 4G acceptance.'],
  baseline_status: 'NOT_RUN', status: 'PASS',
  actual: 'API scanner and ticket check-in: 5 files/34 tests passed. Web offline-scanner/scanner: 2 files/17 tests passed. Total 7 files/51 tests, exit code 0. Unit-only; source acceptance rows remain unchanged and browser/device/DB synchronization is not asserted.',
  evidence_files: evidence, source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R63')) progress.push({
  id: 'R63', title: 'Focused offline scanner and check-in unit regression', dependencies: ['R62'], status: 'VERIFIED',
  actual: 'API scanner/check-in 34 tests and web offline scanner 17 tests passed (7 files/51 total). No live browser, DB, device camera or 4G tested; source acceptance statuses remain unchanged.', evidence,
});
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R63';
manifest.verification = { ...manifest.verification, r63OfflineCheckinUnit: 'PASS (7 files/51 tests; unit-only)' };
manifest.supplementalResults = { rows: 11, PASS: 11 };
write('run-manifest.json', manifest);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R62', '# Báo cáo kiểm tra local demo — R63');
report = report.replace('## Checkpoint mới nhất · R62', '## Checkpoint mới nhất · R63');
report = report.replace('Supplemental rows: 10. R61 coupon unit (1 file/5 tests) and R62 payment/ticket unit (4 files/60 tests) passed; these narrow checks do not change source-derived acceptance status. Combined results: 510; PASS 171, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.', 'Supplemental rows: 11. R61 coupon unit (1 file/5 tests), R62 payment/ticket unit (4 files/60 tests), and R63 offline/check-in unit suites (7 files/51 tests) passed; these narrow checks do not change source-derived acceptance status. Combined results: 511; PASS 172, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 43 | 30 | 0 | 13 | 0 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 44 | 31 | 0 | 13 | 0 | 0 | 0 | 0 |');
report = report.replace('- R60: trên build cũ,', '- R63: API scanner/check-in 34 tests và web offline-scanner 17 tests PASS (7 files/51 tests). Chỉ là unit evidence; chưa chứng minh browser, DB, camera, thiết bị hay 4G.\n- R60: trên build cũ,');
report = report.replace('tiến độ R43–R62 ở `progress.json`', 'tiến độ R43–R63 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R63', rows: results.length, progress: progress.length }));
