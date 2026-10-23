import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../../..');
const dir = import.meta.dirname;
const read = (name) => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
const write = (name, value) => writeFileSync(resolve(dir, name), `${JSON.stringify(value, null, 2)}\n`);
const results = read('results.json');
const evidence = [
  'r18-d17-full-api-e2e-final.log', 'r18-d17-full-api-e2e-final.exitcode',
  'r18-d17-payment-unit-final.log', 'r18-d17-payment-unit-final.exitcode',
  'r18-d17-order-review-ui-unit.log', 'r18-d17-order-review-ui-unit.exitcode',
  'd17-browser-verification.json', 'd17-payment-unknown-desktop.png', 'd17-payment-unknown-mobile.png',
  'apps/api/test/mock-gateway.e2e-spec.ts', 'apps/api/src/payments/payments.service.ts',
  'apps/web/src/features/order-review/order-review.tsx',
];
const actual = 'D17 được người dùng duyệt: phản hồi từ chối rõ ràng chuyển attempt sang FAILED và cho phép tạo attempt mới; timeout/lỗi không rõ kết quả giữ INITIATED, trả PAYMENT_OUTCOME_UNKNOWN, từ chối thử lần nữa bằng PAYMENT_RECONCILIATION_REQUIRED. Isolated PostgreSQL/API E2E xác nhận trạng thái order/seat/ticket và chặn retry; browser desktop 1440×1000 và mobile 390×844 xác nhận cảnh báo đối soát, nút thử lại bị khóa và chỉ một POST thanh toán sau khi nhận kết quả mơ hồ. Các adapter/unit/API/web suites, build, typecheck đã chạy theo log dẫn chiếu. Browser dùng fault injection ở API boundary; provider thật/staging chưa được kiểm chứng.';
for (const id of ['INT-14', 'INT-14.01', 'INT-14.02', 'INT-14.03']) {
  const row = results.find((item) => item.id === id);
  if (!row) throw new Error(`Missing result row ${id}`);
  row.status = 'PASS';
  row.actual = actual;
  row.evidence_files = [...new Set([...(row.evidence_files ?? []), ...evidence])];
}
write('results.json', results);
const decisions = read('decision-register.json');
const d17 = decisions.find((item) => item.id === 'D17');
if (!d17) throw new Error('Missing D17 decision record');
d17.status = 'APPROVED_USER';
d17.approval_source = 'User reply in current conversation';
d17.choice = 'C — explicit rejection permits retry; ambiguous timeout/transport failure blocks retry and requires reconciliation.';
d17.notes = 'Implemented and verified locally: definitive rejection marks FAILED; ambiguous result retains INITIATED and blocks another attempt. Real provider/staging behavior remains unverified.';
write('decision-register.json', decisions);
let bugs = readFileSync(resolve(dir, 'bugs.md'), 'utf8');
bugs = bugs.replace('- **Disposition:** OPEN / NEEDS_DECISION D17. Do not mark the attempt FAILED or permit retry until the user chooses reconciliation semantics; the transport error cannot prove the provider did not accept the request.', '- **Disposition:** Fixed in the current local source under approved D17. Explicit rejection is retryable; ambiguous outcome remains INITIATED and requires reconciliation. Local E2E, adapter/unit, and desktop/mobile UI evidence is recorded in `d17-browser-verification.json` and `r18-d17-*`. External provider/staging behavior remains unverified.');
writeFileSync(resolve(dir, 'bugs.md'), bugs);
const progress = read('progress.json');
const r18 = progress.find((item) => item.id === 'R18');
if (r18) {
  r18.actual += ' D17 subsequently approved and implemented: explicit rejection is retryable; ambiguous initiation is blocked pending reconciliation. Isolated API/PostgreSQL E2E, full API suites, web tests/build/typecheck, and injected desktop/mobile browser UI verification are recorded under r18-d17 and d17-browser-verification. External gateway behavior remains unverified.';
  r18.evidence = [...new Set([...(r18.evidence ?? []), ...evidence])];
}
write('progress.json', progress);
const counts = results.reduce((acc, item) => (acc[item.status] = (acc[item.status] ?? 0) + 1, acc), {});
const checkpoint = { run_id: '20261022T230000-remediation', checkpoint: 'R18 / INT-14 after D17 approval', recorded_at: new Date().toISOString(), changed_cases: ['INT-14', 'INT-14.01', 'INT-14.02', 'INT-14.03'], counts, decision: d17, limitations: ['Mock/local gateway only; no real provider or staging verification.', 'Browser injects the ambiguous outcome at the API boundary; API persistence behavior is independently checked by isolated PostgreSQL E2E.', 'Repository remediation remains incomplete outside this local slice.'], evidence_files: evidence };
write('r18-d17-checkpoint.json', checkpoint);
appendFileSync(resolve(dir, 'report.md'), [
  '', '', '## Tiếp tục R18 — D17 đã chốt và luồng thanh toán mơ hồ được kiểm tra', '',
  'D17: từ chối rõ ràng cho phép thử lại; timeout/lỗi vận chuyển mơ hồ giữ attempt ở INITIATED, khóa thử lại và yêu cầu đối soát. API trả PAYMENT_OUTCOME_UNKNOWN; lần gọi tiếp bị chặn bằng PAYMENT_RECONCILIATION_REQUIRED. Quyết định người dùng được lưu trong decision-register.json.', '',
  'INT-14 và các mệnh đề .01–.03 hiện PASS cho phạm vi local hiện tại: isolated PostgreSQL/API E2E xác nhận order vẫn PENDING, ghế còn giữ/chưa bán, không phát ticket và không tạo payment attempt thứ hai; API/web tests, build và typecheck có log đính kèm; browser desktop 1440×1000 và mobile 390×844 thao tác đúng trang order-review, nhận kết quả mơ hồ, hiển thị yêu cầu đối soát, khóa nút thanh toán và chỉ gửi một POST. Browser dùng route fault injection ở API boundary; backend state được xác minh độc lập bằng E2E PostgreSQL.', '',
  `Kết quả hiện tại của results.json: ${results.length} dòng, PASS ${counts.PASS ?? 0}, FAIL ${counts.FAIL ?? 0}, BLOCKED ${counts.BLOCKED ?? 0}, MISSING ${counts.MISSING ?? 0}, NEEDS_DECISION ${counts.NEEDS_DECISION ?? 0}, NOT_RUN ${counts.NOT_RUN ?? 0}. Đây không phải nghiệm thu toàn dự án: test với gateway/provider thật, staging, khả năng đối soát bên ngoài và các yêu cầu R00–R23 còn mở vẫn chưa được chứng minh. Browser smoke tổng dừng tại reschedule vì fixture nhận trạng thái không như kỳ vọng; log/screenshot chẩn đoán được giữ lại, không thay expected để xanh.`, '',
  'Checkpoint chi tiết: r18-d17-checkpoint.json; screenshot: d17-payment-unknown-desktop.png, d17-payment-unknown-mobile.png.', '',
].join('\n'));
