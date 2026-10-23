import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = import.meta.dirname;
const read = (n) => JSON.parse(readFileSync(resolve(dir, n), 'utf8'));
const write = (n, x) => writeFileSync(resolve(dir, n), `${JSON.stringify(x, null, 2)}\n`);
const results = read('results.json');
const evidence = [
  'r19-int06-conflict-browser.json', 'int06-postgres-oracle.json',
  'r19-int06-browser-attempt4.log', 'r19-int06-browser-attempt4.exitcode',
  'r19-fixture-verify-int06.log', 'int06-offline-before-sync-desktop.png',
  'int06-offline-before-sync-mobile.png', 'int06-conflict-report-desktop-device-A.png',
  'int06-conflict-report-mobile-device-B.png', 'apps/web/scripts/ai-remediation-int06-browser.mjs',
  'apps/api/scripts/ai-remediation-r19-fixture.mjs', 'apps/api/src/scanner/offline-admissions.service.ts',
  'apps/web/src/features/scanner/conflict-report.tsx', 'decision-register.json',
];
const actual = 'Theo D05 được duyệt, hai browser context độc lập (1440×1000 và 390×844) cùng quét một vé PAID khi offline. Thiết bị B có timestamp muộn hơn nhưng upload trước; thiết bị A upload sau với timestamp sớm hơn. API nhận cả hai. PostgreSQL độc lập xác nhận hai offline_scan_logs với deviceId khác nhau, offsets hữu hạn, lượt A ACCEPTED, B CONFLICT; đúng một NORMAL admission theo scanId/cửa/thời gian A và order_items.checkedInAt bằng timestamp A. UI báo cáo conflict desktop/mobile hiển thị mã vé, cửa thắng/thua, hai thời điểm và offset; không có page error. Fixture teardown đã chạy.';
const base = results.find((r) => r.id === 'INT-06');
if (!base) throw new Error('Missing INT-06 result row');
base.status = 'PASS';
base.actual = actual;
base.evidence_files = [...new Set([...(base.evidence_files ?? []), ...evidence])];
const add = (id, expected, text, files) => {
  if (results.some((r) => r.id === id)) throw new Error(`Result exists: ${id}`);
  results.push({ id, requirement_id: ['S-33', 'S-34', 'S-35', 'S-36', 'S-52'], kind: 'INTEGRATION_ASSERTION', group: 'Hành trình vé offline — INT-06 split', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P0', source: { origin: 'Subcase split for INT-06; not a new Excel requirement' }, original_requirement: null, expected: [expected], baseline_status: 'NOT_RUN', status: 'PASS', actual: text, evidence_files: files, source_ac_unchanged: true });
};
add('INT-06.01', 'Two independent offline clients scan the same ticket; the later device timestamp may sync first and both observations remain available.', 'Desktop and mobile Chromium contexts were independently provisioned and cached the same snapshot. Both accepted the offline scan. Browser report confirms B/later timestamp synced before A/earlier timestamp and both HTTP calls returned 200. DB keeps two different device IDs and two original timestamps.', ['r19-int06-conflict-browser.json', 'r19-int06-browser-attempt4.log', 'int06-offline-before-sync-desktop.png', 'int06-offline-before-sync-mobile.png']);
add('INT-06.02', 'Approved earlier-device-time rule wins, retains both offsets, and conflict report exposes winning and losing observations.', 'PostgreSQL oracle confirms earlier scan ACCEPTED and chosen as the sole NORMAL admission; later scan is CONFLICT; both clock offsets and received times are preserved; order item checkedInAt equals the earlier device timestamp. Conflict report UI rendered the two gates/times/offsets on desktop and mobile.', ['int06-postgres-oracle.json', 'r19-fixture-verify-int06.log', 'int06-conflict-report-desktop-device-A.png', 'int06-conflict-report-mobile-device-B.png', 'decision-register.json']);
write('results.json', results);
const progress = read('progress.json');
const r19 = progress.find((r) => r.id === 'R19');
if (r19) {
  r19.actual += ' INT-06 now passes on two isolated browser contexts and PostgreSQL: later device B uploaded first, earlier device A uploaded second, the earlier timestamp became the sole NORMAL admission, the later row remained conflict, both offsets/observations remained stored, and conflict UI showed both devices on desktop/mobile. Fixture cleanup and API/web stop succeeded. R19 still has INT-07/10/15/16 and external camera/4G/staging gaps.';
  r19.evidence = [...new Set([...(r19.evidence ?? []), ...evidence])];
}
write('progress.json', progress);
const queue = read('execution-queue.json');
for (const id of ['INT-05', 'INT-06']) {
  const item = queue.cases.find((r) => r.case_id === id);
  const result = results.find((r) => r.id === id);
  if (item && result) { item.current_status = result.status; item.existing_actual = result.actual; item.evidence_files = [...new Set([...(item.evidence_files ?? []), ...(result.evidence_files ?? [])])]; }
}
write('execution-queue.json', queue);
const counts = results.reduce((m, r) => (m[r.status] = (m[r.status] ?? 0) + 1, m), {});
write('r19-int06-checkpoint.json', { run_id: '20261022T230000-remediation', checkpoint: 'R19 / INT-06 cross-device offline conflict', recorded_at: new Date().toISOString(), changed_cases: ['INT-06', 'INT-06.01', 'INT-06.02'], counts, decision: 'D05 approved baseline: earlier original device scan timestamp wins; clock offsets retained for interpretation.', execution: { browser_contexts: 2, viewports: ['1440x1000', '390x844'], sync_order: 'later timestamp first, earlier timestamp second', api_statuses: [200, 200], postgres_rows: { accepted: 1, conflict: 1, normal_admissions: 1 }, result: 'PASS local isolated profile' }, limitations: ['Chromium contexts emulate device/browser storage but are not physical scanners.', 'No 4G, camera, or staging claim.'], evidence_files: evidence });
appendFileSync(resolve(dir, 'report.md'), [
  '', '', '## Tiếp tục R19 — INT-06 conflict giữa hai thiết bị offline', '',
  'INT-06, .01 và .02 PASS local. Hai Chromium context độc lập (desktop/mobile) cache cùng snapshot, quét cùng vé khi offline; B có timestamp muộn hơn đồng bộ trước, A có timestamp sớm hơn đồng bộ sau. Hai request API đều 200. Oracle PostgreSQL xác nhận đúng hai scan log khác device ID, lưu scannedAt/receivedAt/offset; A là ACCEPTED và admission NORMAL duy nhất, B là CONFLICT; checkedInAt đúng thời điểm thiết bị A. Báo cáo conflict browser hiển thị vé, cửa thắng/thua, thời điểm và offset trên cả hai viewport. Fixture được cleanup.', '',
  'Đây là kiểm tra hai browser context trên localhost, không phải hai máy quét vật lý, 4G hoặc staging. R19 tiếp tục IN_PROGRESS vì INT-07/10/15/16 và kiểm tra ngoại vi vẫn mở. Checkpoint: r19-int06-checkpoint.json.', '',
].join('\n'));
