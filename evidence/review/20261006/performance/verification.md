# Tối ưu đường giữ ghế liên quan snapshot S-16

Ngày 06/10/2026, trên branch `test`, base `240ae2d`. Người dùng đã cho phép kiểm tra lại và sửa lỗi CI. Không merge hoặc thay `main`.

## Lỗi đã xác nhận

CI run https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37357701641 : T-31 hold-concurrency thất bại ở assertion `Product HTTP p95 must be strictly below300ms`. 45 kiểm tra chức năng PASS; p95 tổng 452.14 ms, steady 337.41 ms. Bốn job còn lại PASS. Lịch sử trước S-16 cũng có lượt NFR FAIL; không kết luận S-16 là nguyên nhân duy nhất hoặc gán lỗi cho người khác.

## Bản sửa

- `apps/api/src/holds/holds.service.ts`: gộp cập nhật `expectedSeatIds` vào session upsert. Giảm từ 5 xuống 4 câu lệnh SQL trong transaction giữ ghế thành công; bớt một lượt round-trip và một UPDATE phiên. Snapshot là tập hợp ghế đã xác nhận của token hiện tại, không phải chỉ các bản ghi còn sống.
- Phiên mới nhận danh sách yêu cầu; phiên còn hạn hợp nhất/deduplicate; token mới sau hết hạn thay danh sách cũ. Cùng transaction với seat upsert, tranh chấp rollback cả snapshot và toàn bộ nhóm ghế. Giữ nguyên thứ tự khóa, PostgreSQL authority, xác thực mỗi request, deadline và kiểm tra lost seats khi tạo đơn.
- `apps/api/scripts/verify-holds-http.mjs`: chỉ thêm `HOLDS_EVIDENCE_DIR` để không ghi đè bằng chứng cũ. CI không đặt biến này nên đường dẫn artifact mặc định không đổi. Không đổi tải, số vòng, assertion, worker hoặc ngưỡng 300 ms.
- `apps/api/test/s15-s16-acceptance.e2e-spec.ts`: thêm TC-S16-16/17/18/19 cho merge đồng thời, retry dedup, rollback phiên mới và bảo toàn ghế bị mất khi thêm ghế.
- Cập nhật danh sách test trong `docs/testing/S15-S16-test-cases.md`.

## Regression

- `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd build`: PASS.
- `pnpm.cmd test`: 23/23 PASS (API 6, web 17).
- E2E: 41/41 PASS, 6 file; suite S-15/S-16 24/24 PASS. Bao gồm lost/expired/cleaned/reclaimed seats, lock-wait expiry, rollback, pricing snapshot và double-click.
- JSON E2E và performance integration: `regression/`; DB `sprint2_integration` tại 127.0.0.1:15432, fixture riêng tự dọn.
- Health local API: HTTP 200, status ok. Không đổi frontend nên không chạy lại browser và không xem bằng chứng cũ là lượt browser mới.
- Cảnh báo Vite cấu hình baseline không làm test fail; không nâng dependencies hoặc thay CI.

## Benchmark trước/sau

Hai API Nest thực, cookie DB guard mỗi request, PostgreSQL 15, Valkey 8. DB test mới `sang_holds_local` tại 127.0.0.1:15434, cache test riêng 16382. Không sử dụng hoặc restart DB/Redis demo. 200 người mua giả tranh 100 ghế, 10 vòng/2.000 HTTP requests. Cả tổng và steady phải p95 < 300 ms; giữ nguyên mọi sample kể cả lượt đầu. Mỗi vòng phải đúng 100 thành công, 100 conflict, 0 lỗi khác và 100 quyền ghế duy nhất.

| Lượt | Total p95 ms | Steady p95 ms | Gate |
|---|---:|---:|---|
| Trước sửa, local (`before/`) | 283.40 | 262.93 | PASS |
| Sau sửa, local (`after-1/`) | 280.93 | 241.60 | PASS |
| Sau sửa lặp lại, local (`after-2/`) | 282.51 | 245.52 | PASS |

Lượt trước sửa vẫn có thể PASS local trong khi FAIL CI. Chênh lệch đo trên máy có nhiễu; việc giảm một câu lệnh SQL là thay đổi cấu trúc đã xác nhận, chưa chứng minh đó là nguyên nhân duy nhất của CI chậm. Không suy rộng các phép đo này thành NFR production/staging hoặc ổn định dài hạn. Bằng chứng cũ được giữ nguyên, không đổi durability/pool/cache auth để lấy PASS.

Hai lượt sau sửa đều PASS 45/45 checks (bao gồm worker cadence/restart và cache restart), mỗi lượt đủ 2.000 requests. CI cho commit sửa phải được kiểm tra tiếp; báo cáo này tại thời điểm tạo chưa xác nhận CI mới xanh.
