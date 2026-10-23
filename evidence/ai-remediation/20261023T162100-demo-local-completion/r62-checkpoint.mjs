import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const evidence = ['r62-payment-ticket-unit.log', 'r62-payment-ticket-unit.log.exitcode'];
const resultId = 'DEMO-PAYMENT-TICKET-UNIT-01';
const results = read('results.json');
if (!results.some((x) => x.id === resultId)) results.push({
  id: resultId, requirement_id: ['S-18', 'S-20', 'S-21', 'S-27'], kind: 'SUPPLEMENTAL_UNIT',
  group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Kiểm tra hồi quy bổ sung; không thay thế acceptance case trong inventory' }, original_requirement: null,
  expected: ['Payment mock/webhook service và delivery/signing unit suites chạy không lỗi; phạm vi unit không được coi là bằng chứng DB/browser/provider thật.'],
  baseline_status: 'NOT_RUN', status: 'PASS',
  actual: 'Ran four focused API unit files: mock gateway, payment service, ticket delivery and ticket signing keys. 4 files/60 tests passed, exit code 0. This does not establish PostgreSQL concurrency, browser flow, SMTP delivery, external provider sandbox, or source-derived acceptance beyond those unit assertions.',
  evidence_files: evidence, source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R62')) progress.push({
  id: 'R62', title: 'Focused payment and ticket-delivery unit regression', dependencies: ['R61'], status: 'VERIFIED',
  actual: 'Four isolated API unit suites passed (mock gateway, payment service/webhook, ticket delivery retries and signing keys): 60/60. Narrow unit evidence only; no live DB/provider/browser/email claim and no change to source acceptance statuses.', evidence,
});
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R62';
manifest.verification = { ...manifest.verification, r62PaymentTicketUnit: 'PASS (4 files/60 tests; unit-only)' };
manifest.supplementalResults = { rows: 10, PASS: 10 };
write('run-manifest.json', manifest);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R61', '# Báo cáo kiểm tra local demo — R62');
report = report.replace('## Checkpoint mới nhất · R61', '## Checkpoint mới nhất · R62');
report = report.replace('Supplemental rows: 9. R62 adds one coupon unit-only regression result (1 file/5 tests); source-derived S-56 acceptance is unchanged. Combined results: 509; PASS 170, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.', 'Supplemental rows: 10. R61 coupon unit (1 file/5 tests) and R62 payment/ticket unit (4 files/60 tests) passed; these narrow checks do not change source-derived acceptance status. Combined results: 510; PASS 171, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 42 | 29 | 0 | 13 | 0 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 43 | 30 | 0 | 13 | 0 | 0 | 0 | 0 |');
report = report.replace('- R60: trên build cũ,', '- R62: bốn API unit suite cho mock gateway/payment-webhook, ticket delivery retry và signing chạy 60/60 PASS. Đây chỉ là unit evidence; không khẳng định concurrency PostgreSQL, UI, SMTP hoặc sandbox provider.\n- R60: trên build cũ,');
report = report.replace('tiến độ R43–R61 ở `progress.json`', 'tiến độ R43–R62 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R62', rows: results.length, progress: progress.length }));
