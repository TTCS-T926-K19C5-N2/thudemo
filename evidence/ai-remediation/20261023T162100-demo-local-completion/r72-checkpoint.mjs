import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const results = read('results.json');
const unitId = 'DEMO-PASSWORD-RESET-WORKER-UNIT-01';
if (!results.some((x) => x.id === unitId)) results.push({
  id: unitId, requirement_id: ['S-02', 'DEMO-EMAIL'], kind: 'SUPPLEMENTAL_UNIT', group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Focused local demo email-worker regression; does not replace browser/Mailpit acceptance' }, original_requirement: null,
  expected: ['Core password recovery unit suite passes; local isolated demo launcher config enables reset worker only against the SMTP catcher.'],
  baseline_status: 'NOT_RUN', status: 'PASS', actual: 'apps/api/src/core-completion/core.spec.ts: 1 file/13 tests PASS. Prepared and canonical sprint1 onboarding launcher now emits PASSWORD_RESET_WORKER=true for its isolated profile; its generated SMTP remains loopback catcher. No primary-system configuration changed.',
  evidence_files: ['r72-password-reset-worker-unit.log', 'r72-password-reset-worker-unit.log.exitcode'], source_ac_unchanged: true,
});
const runtimeId = 'DEMO-PASSWORD-RESET-MAILPIT-RUNTIME-01';
if (!results.some((x) => x.id === runtimeId)) results.push({
  id: runtimeId, requirement_id: ['S-02', 'DEMO-EMAIL'], kind: 'SUPPLEMENTAL_ENVIRONMENT', group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Required local runtime retest after isolated worker configuration change' }, original_requirement: null,
  expected: ['Forgot-password browser request produces one synthetic-recipient reset message in Mailpit; linked reset form accepts the live token.'],
  baseline_status: 'NOT_RUN', status: 'BLOCKED', actual: 'The active demo process was started before the worker config change and currently still has the worker disabled. The isolated profile .env and launcher were prepared for PASSWORD_RESET_WORKER=true, SMTP_HOST=127.0.0.1, SMTP_PORT=24930 and catcher mode. Official Restart has not been attempted because free RAM is 1.00GiB, below the 2GiB safety guard. No reset request or DB/mail fixture was created; Mailpit receipt remains unverified until a safe restart.',
  evidence_files: ['r72-profile-email-config-sanitized.json', 'r72-password-reset-worker-unit.log'], source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R72')) progress.push({ id: 'R72', title: 'Enable password-reset delivery in the isolated Mailpit demo profile', dependencies: ['R71'], status: 'PARTIAL', actual: 'Detected demo launcher omitted PASSWORD_RESET_WORKER although SMTP points to local catcher and reset encryption key/origin are valid. Added the worker flag to canonical+prepared local launcher templates and the isolated profile .env; core.spec unit suite passed 13/13. Active process remains on old config; safe Restart is deferred while RAM is 1.00GiB (<2GiB). Mailpit browser test not run; no reset token/email fixture created. This worker is isolated to demo Mailpit and is not enabled on the primary system.', evidence: ['r72-profile-email-config-sanitized.json', 'r72-password-reset-worker-unit.log', 'r72-password-reset-worker-unit.log.exitcode'] });
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R72';
manifest.changedFiles = [...new Set([...(manifest.changedFiles ?? []), 'scripts/sprint1-onboarding.mjs'])];
manifest.verification = { ...manifest.verification, r72PasswordResetUnit: 'PASS (1 file/13 tests)', r72MailpitResetBrowser: 'BLOCKED pending safe local Restart; current free RAM 1.00GiB < 2GiB guard', r72PrimaryWorkerChanged: false };
manifest.demoProfile = { ...manifest.demoProfile, pendingLocalRuntimeConfig: 'PASSWORD_RESET_WORKER=true; SMTP loopback Mailpit; active API process not restarted' };
manifest.supplementalResults = { rows: 19, PASS: 17, BLOCKED: 2 };
write('run-manifest.json', manifest);
let bugs = readFileSync(`${dir}bugs.md`, 'utf8');
if (!bugs.includes('## BUG-DEMO-RESET-WORKER-01')) bugs += `\n\n## BUG-DEMO-RESET-WORKER-01 — Local demo omits password-reset mail worker\n\n- **Severity:** P1 for local account recovery; production settings are outside this demo change.\n- **Requirement/case:** Supplemental local demo email delivery; S-02 account recovery was not an original source AC.\n- **Fixture:** Isolated demo profile only; SMTP is loopback Mailpit at 127.0.0.1:24930; no real recipient, no reset token created.\n- **Finding:** The profile config had a valid registration encryption key/origin and catcher SMTP, but PASSWORD_RESET_WORKER was unset (false). A reset request therefore could enqueue without the delivery worker sending the email.\n- **Fix status:** Added PASSWORD_RESET_WORKER=true to the canonical and prepared demo launcher templates and to the isolated profile .env. Focused CoreService tests pass 13/13. The active process still runs the prior setting.\n- **Retest:** BLOCKED until the official Restart safety guard passes at >=2GiB RAM; then submit a synthetic reset request through UI, verify the exact token hash against the isolated DB row and inspect receipt/form in Mailpit/browser.\n- **Disposition:** Open pending local runtime restart and Mailpit verification.\n`;
writeFileSync(`${dir}bugs.md`, bugs);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R71', '# Báo cáo kiểm tra local demo — R72');
report = report.replace('## Checkpoint mới nhất · R71', '## Checkpoint mới nhất · R72');
report = report.replace('Supplemental rows: 17.', 'Supplemental rows: 19. R72 adds one focused password-reset worker unit PASS and one Mailpit runtime BLOCKED row.');
report = report.replace('Combined results: 517; PASS 178, FAIL 0, NOT_RUN 326, BLOCKED 7, NEEDS_DECISION 5, MISSING 1.', 'Combined results: 519; PASS 179, FAIL 0, NOT_RUN 326, BLOCKED 8, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 50 | 36 | 0 | 13 | 1 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 52 | 37 | 0 | 13 | 2 | 0 | 0 | 0 |');
report = report.replace('- R71: đủ năm tài khoản giả', '- R72: phát hiện `PASSWORD_RESET_WORKER` chưa bật trong template demo, dù SMTP đã là Mailpit loopback. Đã bật worker chỉ trong launcher/profile demo và unit core 13/13 PASS. Active API chưa nạp cấu hình mới; RAM 1,00GiB dưới guard 2GiB nên chưa Restart hoặc gửi yêu cầu reset. Mailpit runtime row BLOCKED, chưa tạo token/email fixture.\n- R71: đủ năm tài khoản giả');
report = report.replace('Demo local hiện READY sau Restart R65; R60 đã retest PASS trên bundle mới.', 'Demo local hiện READY sau Restart R65; R60 đã retest PASS trên bundle mới. Cấu hình bật password-reset worker chỉ trong profile Mailpit đang chờ safe Restart; worker chưa hoạt động trong tiến trình hiện tại.');
report = report.replace('tiến độ R43–R71 ở `progress.json`', 'tiến độ R43–R72 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R72', rows: results.length, progress: progress.length }));
