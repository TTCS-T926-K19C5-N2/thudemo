import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = import.meta.dirname;
const read = (n) => JSON.parse(readFileSync(resolve(dir, n), 'utf8'));
const write = (n, x) => writeFileSync(resolve(dir, n), `${JSON.stringify(x, null, 2)}\n`);
const results = read('results.json');
const base = results.find((r) => r.id === 'INT-05');
if (!base) throw new Error('INT-05 baseline result missing');
const common = ['r19-int05-e2e.log', 'r19-int05-e2e.exitcode', 'int05-admission-oracle.json', 'apps/api/test/ticket-check-in.e2e-spec.ts'];
base.status = 'PASS';
base.actual = 'Run-bound isolated PostgreSQL/API E2E (7/7): a paid ticket produced exactly one NORMAL admission; same-request replay returned ALREADY_RECORDED without adding rows; a distinct second scan returned 409 with the original gate/time; simultaneous checks yielded one winner; after the scoped canOverride grant, a second admission recorded EXCEPTION with reason, staff identity, gate and ownerConfirmed, and replay remained idempotent. Existing authenticated Chromium desktop/mobile evidence exercises the authorized override UI. Local profile only.';
base.evidence_files = [...new Set([...(base.evidence_files ?? []), ...common, 'r19-override-success-desktop.png', 'r19-override-success-mobile.png', 'r19-delta-browser.json', 'r19-duplicate-browser.json'])];
const add = (id, expected, actual, evidenceFiles) => {
  if (results.some((r) => r.id === id)) throw new Error(`Result already exists: ${id}`);
  results.push({ id, requirement_id: ['S-30', 'S-31'], kind: 'INTEGRATION_ASSERTION', group: 'Vé/cửa/offline — INT-05 split', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P0', source: { origin: 'Subcase split for INT-05; not a new Excel requirement' }, original_requirement: null, expected: [expected], baseline_status: 'NOT_RUN', status: 'PASS', actual, evidence_files: evidenceFiles, source_ac_unchanged: true });
};
add('INT-05.01', 'NORMAL admission is unique; replay is idempotent; a later duplicate reports original gate/time; concurrent scans have one winner.', 'One NORMAL row remained; replay returned ALREADY_RECORDED; duplicate returned 409 with Cửa A and original timestamp; concurrent scan returned exactly one 200 and one 409.', ['r19-int05-e2e.log', 'int05-admission-oracle.json', 'apps/api/test/ticket-check-in.e2e-spec.ts']);
add('INT-05.02', 'An authorized exception preserves first admission and records reason/staff/gate/time; replay does not add a row.', 'PostgreSQL oracle found exactly one NORMAL and one EXCEPTION row; exception stores approved reason, assigned staff name/ID, Cửa B, ownerConfirmed=true; both request replays were idempotent and total rows remained two.', ['r19-int05-e2e.log', 'int05-admission-oracle.json', 'docs/S31_PERMISSION_DECISION.md']);
add('INT-05.03', 'Authorized admission override can be completed from desktop and mobile scanner UI.', 'Previous isolated authenticated Chromium checks captured successful exception flow on desktop and mobile; this turn revalidated the backend contract and persisted audit fields.', ['r19-override-success-desktop.png', 'r19-override-success-mobile.png', 'r19-delta-browser.json', 'r19-duplicate-browser.json']);
write('results.json', results);
const progress = read('progress.json');
const r19 = progress.find((r) => r.id === 'R19');
if (r19) {
  r19.actual += ' INT-05 is now fully verified locally: focused run-bound E2E passed 7/7 and DB oracle confirms unique NORMAL, idempotent replay, first gate/time on duplicate, scoped exception reason/staff audit, and no extra rows on replay; existing authenticated desktop/mobile override screenshots supply the UI slice. INT-06/07/10/15/16 and real camera/4G/staging remain open.';
  r19.evidence = [...new Set([...(r19.evidence ?? []), ...common, 'r19-override-success-desktop.png', 'r19-override-success-mobile.png', 'r19-delta-browser.json', 'r19-duplicate-browser.json'])];
}
write('progress.json', progress);
const counts = results.reduce((m, r) => (m[r.status] = (m[r.status] ?? 0) + 1, m), {});
const checkpoint = { run_id: '20261022T230000-remediation', checkpoint: 'R19 / INT-05 admission replay and exception', recorded_at: new Date().toISOString(), changed_cases: ['INT-05', 'INT-05.01', 'INT-05.02', 'INT-05.03'], counts, local_execution: 'Isolated PostgreSQL API E2E: 1 file / 7 tests PASS; synthetic run-bound rows cleaned by suite teardown.', limitations: ['Does not close INT-06/07 or full R19.', 'Does not prove physical camera or 4G behavior.'], evidence_files: [...common, 'r19-override-success-desktop.png', 'r19-override-success-mobile.png', 'r19-delta-browser.json', 'r19-duplicate-browser.json'] };
write('r19-int05-checkpoint.json', checkpoint);
appendFileSync(resolve(dir, 'report.md'), [
  '', '', '## Tiếp tục R19 — INT-05 soát vé, replay và ngoại lệ', '',
  'INT-05 và các mệnh đề .01–.03 PASS ở phạm vi local: test E2E lọc trên PostgreSQL cô lập đạt 7/7; oracle độc lập xác nhận một NORMAL, replay idempotent, duplicate trả cửa/giờ vào đầu tiên, quét đồng thời chỉ có một lần vào thành công; exception cần quyền canOverride theo suất/cửa, lưu reason/staff/gate/owner confirmation, giữ nguyên lần NORMAL và không nhân dòng khi replay. UI override desktop/mobile có ảnh browser đã lưu từ R19. Không suy ra camera vật lý, 4G hoặc staging từ kết quả này.', '',
  `Tổng results.json: ${results.length} dòng; PASS ${counts.PASS ?? 0}, FAIL ${counts.FAIL ?? 0}, BLOCKED ${counts.BLOCKED ?? 0}, NEEDS_DECISION ${counts.NEEDS_DECISION ?? 0}, MISSING ${counts.MISSING ?? 0}, NOT_RUN ${counts.NOT_RUN ?? 0}. R19 vẫn IN_PROGRESS; INT-06/07/10/15/16 và các prerequisite thiết bị/mạng còn mở. Chi tiết: r19-int05-checkpoint.json.`, '',
].join('\n'));
