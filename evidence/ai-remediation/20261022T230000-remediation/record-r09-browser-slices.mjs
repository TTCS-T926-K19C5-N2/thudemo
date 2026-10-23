import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = import.meta.dirname;
const read = (n) => JSON.parse(readFileSync(resolve(dir, n), 'utf8'));
const write = (n, x) => writeFileSync(resolve(dir, n), `${JSON.stringify(x, null, 2)}\n`);
const results = read('results.json');
const smoke = ['browser-ui-smoke.json', 'browser-ui-smoke-rerun-2.log', 'browser-ui-smoke-rerun-2.exitcode'];
const make = (id, expected, actual, evidenceFiles) => {
  if (results.some((r) => r.id === id)) throw new Error(`Result already exists: ${id}`);
  results.push({ id, requirement_id: ['S-04', 'S-07', 'S-08', 'S-61'], kind: 'INTEGRATION_ASSERTION', group: 'Core flow browser slice — INT-12', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1', source: { origin: 'Narrow browser assertion split from INT-12; not a new Excel requirement' }, original_requirement: null, expected: [expected], baseline_status: 'NOT_RUN', status: 'PASS', actual, evidence_files: evidenceFiles, source_ac_unchanged: true });
};
make('INT-12.UI-01', 'Organizer can hide and republish the run-bound event from the real browser UI, and the published event returns to the catalog.', 'Owner authenticated in Chromium; hide action returned its success status, publish action returned “Sự kiện đã được công bố.”, and the fixture event appeared in catalog. Desktop and mobile screenshots were captured; browser reported no page errors.', ['publication-ui-before.png', 'publication-ui-success.png', 'catalog-fixture-mobile.png', ...smoke, 'browser-fixture-summary.json']);
make('INT-12.UI-02', 'Reschedule UI rejects a past time and accepts a future time with queued/not-sent status while the notification worker is off.', 'Past local time was rejected; future 2033-06-15T10:30 was accepted and UI showed QUEUED with worker-off/not-sent notice. The dedicated fixture showtime had no admission rows; resulting schedule-change row was removed during run-bound cleanup.', ['reschedule-ui-success.png', 'browser-ui-smoke-rerun-2.log', 'browser-ui-smoke-rerun-2.exitcode', 'browser-fixture-cleanup.json', 'apps/api/scripts/ai-remediation-browser-fixture.mjs']);
make('INT-12.UI-03', 'Forgot-password navigation and generic acknowledgement are rendered for a synthetic unknown email without revealing account existence.', 'Browser navigated from login to forgot-password and displayed a generic success message after submitting an .invalid synthetic address. This does not prove a reset token/email was sent or reset lifecycle works.', ['forgot-password-generic-success.png', ...smoke]);
make('INT-12.UI-04', 'Admin can open mail-failure operations and sees the empty state without unintended retry.', 'Synthetic ADMIN logged in and opened operations mail panel; empty state rendered; script confirmed it did not trigger a retry. This does not verify non-empty filtering/retry or SMTP delivery.', ['admin-mail-failures-empty.png', ...smoke]);
make('INT-12.UI-05', 'Catalog renders loading, empty, error and populated states on current desktop/mobile browser viewports.', '1440×1000 showed initial loading and empty catalog before publication, artificial 900ms response retained loading, injected HTTP 503 showed an alert, and 390×844 rendered the published fixture. No page errors were observed.', ['catalog-loading-desktop.png', 'catalog-empty-desktop.png', 'catalog-loading-delayed-desktop.png', 'catalog-error-desktop.png', 'catalog-fixture-mobile.png', ...smoke]);
const csv = results.find((r) => r.id === 'S-62-AC01');
if (csv) csv.evidence_files = [...new Set([...(csv.evidence_files ?? []), 'attendance-csv-browser.json', 'attendance-csv-report-ui.png', 'browser-ui-smoke-rerun-2.log', 'browser-ui-smoke-rerun-2.exitcode'])];
write('results.json', results);
const progress = read('progress.json');
const r09 = progress.find((r) => r.id === 'R09');
if (r09) {
  r09.actual += ' Browser core UI smoke now completes end-to-end after correcting only the test fixture and CSV assertion: catalog states, owner hide/re-publish, past/future reschedule, CSV download and admin mail empty-state were exercised. This supplies narrow UI slices, not full INT-12; password reset lifecycle, full mail retry/filter, purchase/payment journey and direct DB/API oracles for all core operations remain open.';
  r09.evidence = [...new Set([...(r09.evidence ?? []), ...smoke, 'publication-ui-success.png', 'reschedule-ui-success.png', 'attendance-csv-browser.json', 'attendance-csv-report-ui.png', 'admin-mail-failures-empty.png', 'browser-fixture-cleanup.json'])];
  r09.status = 'IN_PROGRESS';
}
write('progress.json', progress);
const counts = results.reduce((m, r) => (m[r.status] = (m[r.status] ?? 0) + 1, m), {});
const checkpoint = { run_id: '20261022T230000-remediation', checkpoint: 'R09 narrow core browser slices', recorded_at: new Date().toISOString(), changed_cases: ['INT-12.UI-01', 'INT-12.UI-02', 'INT-12.UI-03', 'INT-12.UI-04', 'INT-12.UI-05', 'S-62-AC01'], counts, limitations: ['INT-12 parent remains NOT_RUN; user purchase/payment and full reset/mail-lifecycle integrations are not covered by this browser smoke.', 'SMTP worker remained disabled; queued is not sent.', 'No production provider, staging, camera or 4G evidence.'], evidence_files: [...smoke, 'publication-ui-success.png', 'reschedule-ui-success.png', 'attendance-csv-browser.json', 'attendance-csv-report-ui.png', 'admin-mail-failures-empty.png', 'browser-fixture-cleanup.json'] };
write('r09-browser-slices-checkpoint.json', checkpoint);
appendFileSync(resolve(dir, 'report.md'), [
  '', '', '## Tiếp tục R09 — các lát cắt core trên browser', '',
  'Browser smoke hoàn tất exit 0 trên build local hiện tại: catalog loading/empty/error/populated, organizer hide/re-publish, reschedule past/future, organizer CSV download và admin mail empty-state. INT-12.UI-01–.05 là các assertion hẹp mới được thêm; INT-12 tổng thể vẫn NOT_RUN vì smoke chưa chạy buyer purchase/payment, token reset lifecycle, SMTP catcher delivery, retry/filter mail hoặc tất cả DB oracle.', '',
  'Smoke ban đầu thất bại do fixture reschedule có admission sẵn; fixture được tách showtime sạch và cleanup đã hoàn tất. Lượt sau CSV assertion sai ở cách quote từng ô; harness được chỉnh để kiểm contract CSV hiện hữu, không đổi sản phẩm/expected. Rerun 2 exit 0; UI/HTTP evidence đã lưu. Worker email tắt, nên QUEUED được ghi là chưa gửi.', '',
  `Results hiện tại: ${results.length} dòng; PASS ${counts.PASS ?? 0}, FAIL ${counts.FAIL ?? 0}, BLOCKED ${counts.BLOCKED ?? 0}, NEEDS_DECISION ${counts.NEEDS_DECISION ?? 0}, MISSING ${counts.MISSING ?? 0}, NOT_RUN ${counts.NOT_RUN ?? 0}. R09 vẫn IN_PROGRESS. Checkpoint: r09-browser-slices-checkpoint.json.`, '',
].join('\n'));
