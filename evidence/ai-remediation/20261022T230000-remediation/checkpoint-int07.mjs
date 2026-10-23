import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const dir = import.meta.dirname;
const root = resolve(dir, '../../..');
const read = (name) => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
const write = (name, value) => writeFileSync(resolve(dir, name), `${JSON.stringify(value, null, 2)}\n`);
const results = read('results.json');
const parent = results.find((row) => row.id === 'INT-07');
if (!parent) throw new Error('INT-07 source row missing.');
const evidence = [
  'r19-int07-offline-recovery-browser.json', 'int07-postgres-oracle.json',
  'r19-int07-offline-recovery-browser-desktop.json', 'int07-postgres-oracle-desktop.json',
  'r19-int07-browser-run1-failure.json', 'r19-int07-browser-run1.log', 'r19-int07-browser-run1.exitcode',
  'r19-int07-browser-run2.log', 'r19-int07-browser-run2.exitcode',
  'r19-int07-browser-desktop.log', 'r19-int07-browser-desktop.exitcode',
  'int07-api-build.log', 'int07-api-build.exitcode', 'int07-web-build.log', 'int07-web-build.exitcode',
  'r19-fixture-verify-int07.log', 'r19-fixture-verify-int07-desktop.log', 'r19-fixture-cleanup.log',
  'int07-commit-response-lost-mobile.png', 'int07-http-failures-retained-mobile.png', 'int07-alternate-account-queue-retained-mobile.png',
  'int07-commit-response-lost-desktop.png', 'int07-http-failures-retained-desktop.png', 'int07-alternate-account-queue-retained-desktop.png',
  'apps/web/scripts/ai-remediation-int07-browser.mjs', 'apps/api/scripts/ai-remediation-r19-fixture.mjs', 'apps/api/scripts/ai-remediation-profile.mjs',
];
const baseActual = 'Current API and web source were rebuilt (API build exit 0; Next production build exit 0; scanner and snapshot routes present). On fresh synthetic fixtures in isolated PostgreSQL, Mailpit/Redis profile, Chromium desktop 1440×1000 and mobile 390×844 each exercised offline scan, commit-then-drop-response (server HTTP 200/ACK then browser transport failure), same requestId retained in IndexedDB, retry/replay ACK, synthetic 401/403/409/500/503 responses retaining that ID and increasing retryCount, staff-account switch with zero sync POST for the foreign queue, and recovery after returning to the original account. Independent DB oracles for both fresh fixture runs found exactly 2 ACCEPTED offline scan rows and 2 unique NORMAL admissions per run; the committed-before-drop scan did not duplicate on replay. Page errors: 0. Fixture cleanup completed; isolated API/Web stopped; no real provider, email, camera, 4G, or staging was used.';
const children = [
  { id: 'INT-07.01', expected: 'Khi server đã commit nhưng ACK bị mất, cùng requestId còn trong hàng đợi bền và retry sau reload được ACK rồi mới được gỡ.', actual: 'PASS. Browser fault injection let the real isolated API commit and return HTTP 200, then aborted the response. IndexedDB retained the same requestId as pending; reload/retry received a durable replay ACK. PostgreSQL showed one ACCEPTED scan and one NORMAL admission for the request, not duplicates.' },
  { id: 'INT-07.02', expected: 'Các lỗi 401/403/409/5xx không làm mất dữ liệu chưa ACK; cùng lượt có thể retry và máy chủ không ghi đôi.', actual: 'PASS local. Real browser requests received injected API-boundary 401, 403, 409, 500 and 503; after each, the same requestId remained pending and retryCount increased. Successful retries ACKed; isolated PostgreSQL independently showed one scan and one admission per ticket. The HTTP errors were synthetic response injection, not real authorization/provider failures.' },
  { id: 'INT-07.03', expected: 'Queue không bị gửi bằng tài khoản staff khác; đăng nhập lại chủ queue khôi phục và đồng bộ được dữ liệu.', actual: 'PASS. In both desktop and mobile browser runs, the alternate synthetic STAFF identity was loaded after page navigation with the same IndexedDB. No sync POST was sent for the prior staff ID; the request remained pending and the original staff account later recovered it.' },
];
for (const child of children) {
  const existing = results.find((row) => row.id === child.id);
  const row = existing ?? { ...parent, id: child.id, source_case_id: 'INT-07', derived_test_decomposition: true, baseline_status: 'NOT_RUN', status: 'NOT_RUN', evidence_files: [] };
  row.expected = [child.expected]; row.actual = child.actual; row.status = 'PASS'; row.evidence_files = [...new Set([...(row.evidence_files ?? []), 'run-manifest.json', ...evidence])];
  if (!existing) results.push(row);
}
parent.status = 'PASS';
parent.actual = baseActual;
parent.evidence_files = [...new Set([...(parent.evidence_files ?? []), 'run-manifest.json', 'r19-int07-checkpoint.json', ...evidence])];
write('results.json', results);
const queue = read('execution-queue.json');
const queueParent = queue.cases.find((item) => item.case_id === 'INT-07');
if (!queueParent) throw new Error('INT-07 execution queue row missing.');
queueParent.current_status = 'PASS';
queueParent.actual = baseActual;
for (const child of children) {
  if (!queue.cases.some((item) => item.case_id === child.id)) queue.cases.push({
    ...queueParent, case_id: child.id, current_status: 'PASS', derived_from: 'INT-07', expected: [child.expected], existing_actual: child.actual,
    evidence_files: ['run-manifest.json', ...evidence], steps: ['Thực hiện như một assertion riêng của INT-07; xem report và checkpoint.'],
  });
}
queue.queue_count = queue.cases.length;
write('execution-queue.json', queue);
const progress = read('progress.json');
const r19 = progress.find((item) => item.id === 'R19');
if (!r19) throw new Error('R19 progress record missing.');
r19.status = 'IN_PROGRESS';
r19.actual = `${r19.actual}\nINT-07 desktop/mobile local slice now PASS: real API commit followed by lost browser response and same-ID durable replay; HTTP 401/403/409/500/503 queue retention; alternate STAFF account made zero sync POSTs and original identity recovered. Two clean run-bound fixtures, each DB oracle exactly two ACCEPTED scan rows and two unique NORMAL admissions; six desktop/mobile screenshots. Build exit 0. Synthetic fixture cleanup succeeded; API/Web stopped. Remaining R19 INT-10/15/16, camera/4G/staging and all external validation remain open.`;
r19.evidence = [...new Set([...(r19.evidence ?? []), 'r19-int07-checkpoint.json', ...evidence])];
write('progress.json', progress);
const manifest = read('run-manifest.json');
const touched = ['apps/api/scripts/ai-remediation-profile.mjs', 'apps/api/scripts/ai-remediation-r19-fixture.mjs', 'apps/web/scripts/ai-remediation-int07-browser.mjs'];
const shaFile = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const map = new Map((manifest.source_file_fingerprints ?? []).map((item) => [item.path, item]));
for (const path of touched) map.set(path, { path, sha256: shaFile(path) });
const fingerprints = [...map.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'));
const fingerprint = createHash('sha256').update(JSON.stringify(fingerprints)).digest('hex');
const touchedFingerprint = createHash('sha256').update(fingerprints.filter((item) => touched.includes(item.path)).map((item) => `${item.path}\0${item.sha256}\n`).join('')).digest('hex');
manifest.source_file_fingerprints = fingerprints; manifest.source_file_count = fingerprints.length;
manifest.current_source_fingerprint_algorithm = 'SHA-256(JSON.stringify(source_file_fingerprints sorted lexicographically by path))';
manifest.current_source_fingerprint_sha256 = fingerprint; manifest.source_fingerprint_algorithm = manifest.current_source_fingerprint_algorithm;
manifest.fingerprint_updated_at = new Date().toISOString(); manifest.current_source_fingerprint_updated_local = manifest.fingerprint_updated_at;
manifest.latest_source_fingerprint = { sha256: touchedFingerprint, algorithm: 'SHA-256 over sorted UTF-8 lines: path + NUL + file SHA-256 + LF; INT-07 browser harness and isolated PostgreSQL oracle tooling', files: fingerprints.filter((item) => touched.includes(item.path)), recorded_local: manifest.fingerprint_updated_at };
manifest.latest_touched_source_files = touched; manifest.latest_touched_source_fingerprint_sha256 = touchedFingerprint;
manifest.latest_checkpoint = 'r19-int07-checkpoint.json'; manifest.latest_checkpoint_recorded_local = manifest.fingerprint_updated_at;
manifest.latest_delta_note = 'INT-07 desktop/mobile local browser/API/PostgreSQL slice verified; R19/R00-R23 remain incomplete.';
manifest.fingerprint_refresh_note = 'Refreshed after INT-07 evidence; only test harness/profile helper files touched in this checkpoint; product source was not changed in this testing turn.';
write('run-manifest.json', manifest);
const counts = {};
for (const row of results) counts[row.status] = (counts[row.status] ?? 0) + 1;
const checkpoint = {
  run_id: manifest.run_id, checkpoint: 'R19 / INT-07 offline durable queue retry and account isolation', recorded_at: manifest.fingerprint_updated_at,
  source_fingerprint_sha256: fingerprint, latest_touched_source_fingerprint_sha256: touchedFingerprint,
  changed_cases: ['INT-07', ...children.map((x) => x.id)], counts, evidence_files: evidence,
  execution: { fixtures: 2, viewports: ['390x844 mobile', '1440x1000 desktop'], http_faults: [401,403,409,500,503], commit_then_drop: 'API committed/ACKed; browser response aborted; same requestId replayed', account_isolation: 'alternate synthetic STAFF sent zero sync requests; original staff recovered', database_oracle_per_fixture: { accepted_offline_scan_rows: 2, normal_admissions: 2, duplicates: 0 }, browser_page_errors: 0, api_build_exit: 0, web_build_exit: 0, cleanup: 'fixture rows deleted, API/Web stopped; isolated DB/Redis/Mailpit retained and healthy', result: 'PASS local isolated profile only' },
  limitations: ['401/403/409/5xx were injected at the API response boundary; this does not represent live provider behavior.', 'Local Chromium responsive viewports are not physical scanners or a 4G/device test.', 'No staging or real mail/provider was used; no claim of external readiness.'],
};
write('r19-int07-checkpoint.json', checkpoint);
const reportFile = resolve(dir, 'report.md');
const summary = `\n\n## R19 — INT-07 hàng đợi offline, retry và cách ly tài khoản\n\nINT-07 và các assertion .01–.03 PASS trong profile local cô lập. API/Web được build từ source hiện tại (exit 0). Hai lượt kiểm tra dùng fixture sạch riêng cho mobile 390×844 và desktop 1440×1000. Browser quét offline; API thật ghi nhận yêu cầu và trả ACK 200 nhưng response bị ngắt ở browser. IndexedDB vẫn giữ cùng requestId; sau tải lại/đăng nhập lại, retry nhận ACK mà PostgreSQL chỉ có một offline scan và một NORMAL admission cho mỗi ticket. Các response 401/403/409/500/503 được chèn ở biên API; requestId còn nguyên và retryCount tăng sau từng lỗi. Khi chuyển sang synthetic STAFF khác, không có POST đồng bộ hàng đợi của tài khoản cũ; trở lại tài khoản chủ thì hàng đợi đồng bộ thành công. Không có page error; fixture đã dọn, API/Web đã dừng.\n\nBằng chứng desktop/mobile và PostgreSQL oracle: r19-int07-offline-recovery-browser*.json, int07-postgres-oracle*.json và sáu ảnh int07-*.png. Lượt đầu chỉ gặp lỗi trong API Playwright của harness (waitForRequestFailed không tồn tại); log/JSON thất bại được giữ riêng và lượt sửa dùng event API đúng, không thay expected sản phẩm.\n\nResults hiện có ${results.length} dòng: ${counts.PASS ?? 0} PASS, ${counts.FAIL ?? 0} FAIL, ${counts.BLOCKED ?? 0} BLOCKED, ${counts.MISSING ?? 0} MISSING, ${counts.NEEDS_DECISION ?? 0} NEEDS_DECISION, ${counts.NOT_RUN ?? 0} NOT_RUN. R19 còn INT-10/15/16 cùng camera/4G/staging; nghiệm thu toàn dự án chưa hoàn tất. Chỉ xác nhận local browser/API/PostgreSQL, không suy ra provider thật, SMTP Inbox hay staging. Checkpoint: r19-int07-checkpoint.json.\n`;
writeFileSync(reportFile, readFileSync(reportFile, 'utf8') + summary);
console.log(JSON.stringify({ counts, source_file_count: fingerprints.length, fingerprint, touchedFingerprint, queue_count: queue.queue_count }));


