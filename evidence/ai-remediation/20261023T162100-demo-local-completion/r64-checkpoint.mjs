import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const id = 'DEMO-AUTH-REGISTRATION-UNIT-01';
const evidence = ['r64-auth-email-unit-api.log', 'r64-auth-email-unit-api.log.exitcode', 'r64-auth-email-unit-web.log', 'r64-auth-email-unit-web.log.exitcode'];
const results = read('results.json');
if (!results.some((x) => x.id === id)) results.push({
  id, requirement_id: ['S-02', 'S-03', 'S-27', 'S-61'], kind: 'SUPPLEMENTAL_UNIT',
  group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Kiểm tra hồi quy bổ sung; không thay thế acceptance case trong inventory' }, original_requirement: null,
  expected: ['Auth/registration/activation focused API and web unit suites pass; unit evidence does not claim live login, consent/database, reset email, or Mailpit delivery.'],
  baseline_status: 'NOT_RUN', status: 'PASS',
  actual: 'API auth controller/service, registration and activation delivery: 4 files/39 tests passed. Web login and activation forms: 2 files/9 tests passed. Total 6 files/48 tests, exit code 0. Forgot-password end-to-end and Mailpit receipt remain unverified in this checkpoint.',
  evidence_files: evidence, source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R64')) progress.push({
  id: 'R64', title: 'Focused auth, registration and activation unit regression', dependencies: ['R63'], status: 'VERIFIED',
  actual: 'API auth/registration/activation 39 tests and web login/activation 9 tests passed (6 files/48 total). This does not establish browser-auth success, consent/database effects, password-reset Mailpit delivery, or real email.', evidence,
});
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R64';
manifest.verification = { ...manifest.verification, r64AuthRegistrationUnit: 'PASS (6 files/48 tests; unit-only)' };
manifest.supplementalResults = { rows: 12, PASS: 12 };
write('run-manifest.json', manifest);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R63', '# Báo cáo kiểm tra local demo — R64');
report = report.replace('## Checkpoint mới nhất · R63', '## Checkpoint mới nhất · R64');
report = report.replace('Supplemental rows: 11. R61 coupon unit (1 file/5 tests), R62 payment/ticket unit (4 files/60 tests), and R63 offline/check-in unit suites (7 files/51 tests) passed; these narrow checks do not change source-derived acceptance status. Combined results: 511; PASS 172, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.', 'Supplemental rows: 12. R61 coupon unit (1 file/5 tests), R62 payment/ticket unit (4 files/60 tests), R63 offline/check-in unit (7 files/51 tests), and R64 auth/registration/activation unit (6 files/48 tests) passed; these narrow checks do not change source-derived acceptance status. Combined results: 512; PASS 173, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 44 | 31 | 0 | 13 | 0 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 45 | 32 | 0 | 13 | 0 | 0 | 0 | 0 |');
report = report.replace('- R60: trên build cũ,', '- R64: auth controller/service, registration, activation delivery, web login và activation 6 files/48 tests PASS. Password-reset end-to-end, DB consent, browser actions và Mailpit delivery chưa được kiểm bằng R64.\n- R60: trên build cũ,');
report = report.replace('tiến độ R43–R63 ở `progress.json`', 'tiến độ R43–R64 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R64', rows: results.length, progress: progress.length }));
