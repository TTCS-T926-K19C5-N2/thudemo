import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const id = 'DEMO-FIVE-ROLE-ROUTE-SMOKE-01';
const evidence = ['r71-five-role-browser-smoke.json', 'r71-five-role-browser-attempt5.log', 'r71-five-role-browser-attempt5.log.exitcode', 'r71-session-oracle.mjs'];
const results = read('results.json');
if (!results.some((x) => x.id === id)) results.push({
  id, requirement_id: ['S-02', 'S-03', 'S-28', 'S-29', 'E-11'], kind: 'SUPPLEMENTAL_DEMO',
  group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Current runtime role smoke; supplemental to source inventory' }, original_requirement: null,
  expected: ['Five synthetic roles sign in through UI, /auth/me confirms the role, their representative feature route renders, and logout succeeds; no business data changes.'],
  baseline_status: 'NOT_RUN', status: 'PASS',
  actual: 'Chromium smoke on the current isolated runtime: ADMIN /admin/users, ORGANIZER /events, BUYER /account, STAFF /scanner, ACCOUNTANT /operations. All five UI login posts returned 200, /auth/me returned 200 with the expected role, the route heading was visible, logout returned 200, and there were no page errors. Synthetic accounts only; no order/event/ticket/seat writes. An initial harness assumption that all roles honor an admin returnTo path was corrected; that was not a product failure.',
  evidence_files: evidence, source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R71')) progress.push({ id: 'R71', title: 'Current runtime sign-in and feature-route smoke for all five demo roles', dependencies: ['R70'], status: 'VERIFIED', actual: 'Five synthetic roles completed browser login, /auth/me role confirmation, representative route heading and logout with 200 responses and no page errors. No business fixture writes. Harness now navigates directly after login rather than assuming safeReturnTo applies to privileged routes.', evidence });
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R71';
manifest.verification = { ...manifest.verification, r71FiveRoleUiSmoke: 'PASS: five synthetic roles, login/me/logout 200, representative route visible' };
manifest.supplementalResults = { rows: 17, PASS: 16, BLOCKED: 1 };
write('run-manifest.json', manifest);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R70', '# Báo cáo kiểm tra local demo — R71');
report = report.replace('## Checkpoint mới nhất · R70', '## Checkpoint mới nhất · R71');
report = report.replace('Supplemental rows: 16.', 'Supplemental rows: 17. R71 adds the current-runtime five-role browser login and feature-route smoke.');
report = report.replace('Combined results: 516; PASS 177, FAIL 0, NOT_RUN 326, BLOCKED 7, NEEDS_DECISION 5, MISSING 1.', 'Combined results: 517; PASS 178, FAIL 0, NOT_RUN 326, BLOCKED 7, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 49 | 35 | 0 | 13 | 1 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 50 | 36 | 0 | 13 | 1 | 0 | 0 | 0 |');
report = report.replace('- R70: full regression', '- R71: đủ năm tài khoản giả đăng nhập UI; `/auth/me` xác nhận đúng role, route Admin/Organizer/Buyer/Staff/Accountant hiện đúng màn hình, logout 200, không page error và không ghi dữ liệu nghiệp vụ. Hai lần chạy đầu của harness giả định sai `returnTo` cho route quản trị; kiểm tra đã đổi sang mở route trực tiếp sau login, không quy thành lỗi sản phẩm.\n- R70: full regression');
report = report.replace('tiến độ R43–R70 ở `progress.json`', 'tiến độ R43–R71 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R71', rows: results.length, progress: progress.length }));
