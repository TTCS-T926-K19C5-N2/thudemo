import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const id = 'DEMO-S15-S16-PG-HARNESS-01';
const evidence = ['r69-s15-s16-migrate.log', 'r69-s15-s16-migrate.log.exitcode', '../20261022T230000-remediation/migration-deploy.log'];
const results = read('results.json');
if (!results.some((x) => x.id === id)) results.push({
  id, requirement_id: ['S-15', 'S-16'], kind: 'SUPPLEMENTAL_ENVIRONMENT', group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Harness readiness attempt; no source acceptance claim' }, original_requirement: null,
  expected: ['Prepare only the disposable PostgreSQL E2E profile before running the S-15/S-16 real-database acceptance file; never target demo or primary DB.'],
  baseline_status: 'NOT_RUN', status: 'BLOCKED',
  actual: 'The profile identity and loopback DB port 62636 were verified as the separate remediation test database. Its three containers started. Prisma migrate deploy stopped before applying migration with “Schema engine error”; zero E2E cases ran. The isolated containers were stopped with their volume preserved; the local demo profile remains READY. This is a test-environment blocker, not a product failure.',
  evidence_files: evidence, source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R69')) progress.push({ id: 'R69', title: 'Prepare isolated PostgreSQL harness for S-15/S-16 acceptance', dependencies: ['R68'], status: 'BLOCKED', actual: 'Separate test profile started; migration deploy failed at schema engine before writes/tests. No test ran; exact test containers stopped, database volume preserved. Demo profile status separately verified READY. Need diagnose migration harness before retry.', evidence });
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R69';
manifest.isolatedAcceptanceHarness = { status: 'BLOCKED', profile: '20261022T230000-remediation', targetWasSeparateLoopbackDb: true, migrationDeploy: 'BLOCKED: Prisma schema engine error before migration or E2E execution', casesExecuted: 0, containersStopped: true, volumePreserved: true, demoRuntimeStillReady: true };
manifest.supplementalResults = { rows: 15, PASS: 14, BLOCKED: 1 };
write('run-manifest.json', manifest);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R67', '# Báo cáo kiểm tra local demo — R69');
report = report.replace('## Checkpoint mới nhất · R67', '## Checkpoint mới nhất · R69');
report = report.replace('Supplemental rows: 14.', 'Supplemental rows: 15. R69 records a blocked, non-product test harness migration attempt; no acceptance test ran.');
report = report.replace('Combined results: 514; PASS 176, FAIL 0, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.', 'Combined results: 515; PASS 176, FAIL 0, NOT_RUN 326, BLOCKED 7, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 47 | 34 | 0 | 13 | 0 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 48 | 34 | 0 | 13 | 1 | 0 | 0 | 0 |');
report = report.replace('- R67: trang chi tiết Bệnh sĩ', '- R69: harness PostgreSQL riêng cho S-15/S-16 xác nhận đúng DB loopback tách biệt, nhưng `prisma migrate deploy` dừng vì schema engine trước khi chạy test. Không áp migration/test nào; container test được dừng, volume giữ lại; profile demo vẫn READY. Đây là BLOCKED môi trường.\n- R67: trang chi tiết Bệnh sĩ');
report = report.replace('tiến độ R43–R67 ở `progress.json`', 'tiến độ R43–R69 ở `progress.json`');
report = report.replace('Các ca NOT_RUN/BLOCKED vẫn cần được làm hoặc phân loại theo phụ thuộc môi trường.', 'Các ca NOT_RUN/BLOCKED vẫn cần được làm hoặc phân loại theo phụ thuộc môi trường. PostgreSQL acceptance S-15/S-16 hiện BLOCKED riêng do Prisma schema engine trong harness; demo profile không bị ảnh hưởng.');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R69', results: results.length, progress: progress.length }));
