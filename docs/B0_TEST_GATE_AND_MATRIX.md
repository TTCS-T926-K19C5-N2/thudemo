# B0 — test gate và định nghĩa ma trận

Ngày 22/10/2026 (Asia/Saigon). Chỉ thực hiện B0 theo chỉ dẫn mới; chưa tích hợp story, migration hoặc sửa API.

## Thay đổi cấu hình

- `apps/web/vitest.config.ts`: `testTimeout: 15_000` thay ngân sách mặc định 5 giây.
- Ca QR duyệt các vị trí/ký tự thay thế và gọi WebCrypto nhiều lần. Audit A đã ghi hai lượt `pnpm test` timeout ở ca này; ca chạy riêng 8/8 pass. Toàn suite chạy đồng thời API/web nên thời gian chờ wall-clock biến động.
- Lượt trước thay đổi trong B0 cũng pass, chứng minh lỗi có tính gián đoạn. Không trình bày lỗi như lúc nào cũng tái hiện được, và không xoá evidence fail của A.
- Giữ nguyên worker mặc định, thứ tự chạy, danh sách file, test cases/assertions, test logic và toàn bộ logic sản phẩm. Không tăng giới hạn AC/NFR; đây chỉ là ngân sách timeout của runner web.

## Kết quả thực chạy

Node 24.21.0; pnpm 10.15.1 theo pin của dự án, lấy từ Corepack cache đã có. Không cài dependency.

| Lệnh | Kết quả B0 | Evidence |
|---|---|---|
| `pnpm test` trước sửa | PASS 420 API + 157 web + 27 deployment; lỗi gián đoạn | [test-before-config.log](../.integration-b0/test-before-config.log) |
| `pnpm test` sau sửa | PASS 420 API + 157 web + 27 deployment, exit 0, 26,28 giây; không có cờ giới hạn worker | [test-after-config.log](../.integration-b0/test-after-config.log) |
| `pnpm build` | PASS, exit 0 | [build.log](../.integration-b0/build.log) |
| `pnpm lint` | PASS, exit 0; warning có sẵn còn nguyên | [lint.log](../.integration-b0/lint.log) |
| `pnpm typecheck` | PASS, exit 0 | [typecheck.log](../.integration-b0/typecheck.log) |
| API E2E | Không chạy lại ở B0: chỉ cấu hình runner web đổi. Bằng chứng A gần nhất là 151/151 PASS trên DB riêng | [e2e-recheck.log](../.integration-audit/e2e-recheck.log) |

Một lệnh kiểm chuẩn tại `D:\Development\03_Academic\thudemo-integration`: `corepack pnpm test` (hoặc `pnpm test` khi PATH trỏ đúng pnpm 10.15.1). Evidence dùng đúng CLI pin với script `test` nguyên bản. Không cần `--maxWorkers`, `--runInBand` hoặc cờ giảm concurrency.

## Ma trận: hai cột mới

[STORY_SOURCE_MATRIX.csv](STORY_SOURCE_MATRIX.csv) vẫn có 1.728 dòng, 27 nguồn × 64 story/spike; không đổi các ô cũ ngoài việc bổ sung chỉ dẫn gate vào `Note`. Thêm đúng hai cột:

| Cột | Giá trị / cách đánh giá |
|---|---|
| `Functional` | `PASS_AC` chỉ khi toàn bộ AC đã được xác minh và có evidence gắn đúng source/HEAD; hiện chưa có dòng đủ điều kiện này |
| | `PARTIAL_LOCAL`: có bằng chứng chạy một phần AC local; không suy thành đủ AC |
| | `FAIL_AC`: có ca AC fail cụ thể; S-44 HTTP404 ở snapshot R19 |
| | `NOT_RUN`: donor chưa được chạy; có test trong source không có nghĩa test đã chạy |
| | `NOT_VERIFIED`: thiếu loại evidence bắt buộc, ví dụ sandbox thật S-18 hoặc spike K-01 chưa chạy lại |
| | `MISSING`: không tìm thấy implementation trong nguồn đó theo phạm vi dò của audit A |
| `DoD_complete` | Boolean `false` cho toàn bộ 1.728 dòng hiện tại; chỉ đổi `true` khi toàn bộ DoD của nguồn đối chiếu đã có bằng chứng |

Các mốc `Status`/HEAD cũ là snapshot nguồn A. B0 chỉ thay cấu hình trong clone integration; không ghi đè hoặc gán cấu hình mới cho thư mục nguồn R19. Do đó `pnpm test` của candidate B0 đã pass, nhưng điều này không viết lại lịch sử fail của snapshot A.

## Gate cần người thật

Mỗi dòng CSV được ghi rõ trong `Note`:

- `REVIEW=HUMAN_REQUIRED`: thành viên khác thực sự review. Agent review, commit, CI hoặc test xanh không thay được điều kiện này trong sheet DoD-DoR được người dùng chọn làm nguồn yêu cầu.
- `STAGING=HUMAN_ENVIRONMENT_CONFIRMATION_AND_ACCEPTANCE_REQUIRED`: người phụ trách xác nhận đúng staging/môi trường và nghiệm thu; có thể dùng smoke/AC tự động làm bằng chứng. Chưa thực hiện hoặc nhận xác nhận này trong B0; local không được gán thành staging.
- `CI_EXACT_SHA=NOT_VERIFIED`, `DEPENDENCY_SCAN=NOT_VERIFIED`: không nhận bằng chứng mới từ việc unit pass.

B0 chưa nhận review người thật, chưa triển khai/đổi staging và chưa xác nhận DoD hoàn chỉnh của story nào. Không tạo một quy trình tự phê duyệt hoặc coi quyết định cũ trong tài liệu khác là thay sheet DoD-DoR.

Evidence kiểm CSV: [matrix-check.json](../.integration-b0/matrix-check.json). Đã kiểm 1.728 khoá Story/Source duy nhất, hai cột mới, mọi dòng có marker gate người thật và các ô cũ được giữ nguyên.

## Điểm dừng tiếp theo

Tiếp tục B1 chỉ để so sánh function/migration, xác minh provenance staging và kịch bản 200 request/100 ghế, rồi trình phương án. Chưa tích hợp `claim_hold_v5/v6`; dừng chờ người dùng chọn phương án trước các nhóm Sprint 1–3, 4–5, 6–8.
