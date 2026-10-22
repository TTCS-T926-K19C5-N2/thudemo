# Tích hợp Sprint 1–3 — candidate-1

Phạm vi người dùng duyệt sau B1 A: chỉ Sprint 1–3, dừng báo cáo trước Sprint 4–5. Nhánh `integration/candidate-1`, điểm bắt đầu `b66aa28`. Yêu cầu chỉ từ workbook gốc (Backlog/Tasks/DoD-DoR) và `approved-refinement.md`; đã đối chiếu SHA256 với audit A, không thay nguồn bằng tài liệu triển khai.

## Thứ tự Deps và cách lấy nguồn

1. G1: S-01 → S-02 → S-04, S-01 → K-01. Giữ phần đã có trong base R19; đối chiếu R20/R07 và các bản auth. Không nhập lùi hành vi kích hoạt/disabled-account.
2. G2: S-04 → S-05 → S-06/S-09; S-05 → **S-15 prerequisite** → S-07 → S-08. S-15 vẫn mang metadata Sprint 3; thực hiện sớm vì AC mở bán yêu cầu giá. Giữ implementation đã có, đối chiếu R22/R19.
3. G3: K-01/S-09 → S-10 → S-12/S-13. Chỉ lấy phần TTL cấu hình R27 còn thiếu, qua migration forward trên lineage A; giữ v6 và sáu trường/API. Khi trực tiếp sửa hold, chạy lại load sau toàn bộ hồi quy, không tối ưu.
4. G4: S-02 → S-03; S-13/S-15 → S-16 → S-17; interface T-40 → mock S-19 → S-20 → S-21/S-22/S-24; S-16 → S-23. Giữ R19 và các test snapshot/expiry/signature/replay hiện có. Đối chiếu R02/R03/R08, không nhập sandbox/caller/migration donor xung đột.

Đây là hợp nhất trên bản nền đã chứa nhiều commit liên quan, không replay code giống nhau để tạo diff. Slice giữ nguyên base được ghi `RETAINED`, phần thực lấy từ donor ghi rõ file/ref và adaptation. Mỗi nhóm có cả năm gate trước commit, không dùng gate B1 thay bằng chứng mới. Không xóa test, refactor, cài dependency hoặc đổi API.

S-03 thuộc Sprint 3 theo refinement. S-11/S-14/S-18 ngoài R0/chưa xếp Sprint nên không lấy thêm; mã có sẵn trong base vẫn giữ nguyên và test hồi quy. S-18 không được đánh Done bằng mock. K-01 chỉ giữ quyết định/các số đo lịch sử, không chạy lại spike hoặc tự xác nhận mentor/review.

## G1 — nền Sprint 1

RETAINED: CI/Docker/launcher/deployment có trong R19 `ae40a377`; events service trùng nội dung chuẩn hóa ở cả 27 nguồn; roles.guard cũng trùng 27 nguồn. Event editor trùng nhóm R20/R19. Auth service R11/R19 giữ hướng dẫn kích hoạt sau xác minh mật khẩu và thông báo disabled account; donor R02 cũ gộp các tình huống thành lỗi generic nên không nhập lùi. Không sửa UI hoặc API nhóm này.

Các gate mới và receipt được ghi sau khi hoàn tất tại `.integration-s123/g1-foundations/`. CI/deploy/staging/rollback thật chưa chạy ở candidate này; giữ S-01 Partial. K-01 thiếu bằng chứng DoD độc lập, giữ Partial. Không suy quyền phê duyệt từ tài liệu K-01 lịch sử.

Lần G1 đầu bị guard suite S-41 từ chối Redis16383; chỉ sửa runner sang Redis16382 của integration, DB8 xác nhận trống. Rerun đầy đủ năm gate pass, không sửa guard. Local launcher `.integration-s123/serve.mjs` compose các entrypoint API/web/expiry hiện có, DB riêng `integration_s123_demo`, cổng3394/3395; smoke thật trả API health200 và web home200, tự dừng đúng tiến trình do nó tạo. Khóa test/credentials bền trong `.git/integration-s123-demo/runtime.json`, không in giá trị, không đưa vào Git. Đăng ký/email transport profile tương tác tắt; luồng đăng ký/kích hoạt được kiểm bằng transport test ở E2E, không tuyên bố email Internet.

## Kết quả nhóm và bằng chứng

### G2 — sơ đồ, giá và mở bán (phần giữ base)

RETAINED theo thứ tự S-05 → S-06/S-09 → S-15 prerequisite → S-07 → S-08. `seat-map.ts` cùng nội dung với các donor có implementation (R22/R19 và nhiều nguồn); parser JSON vị trí dòng/cột chỉ có ở R19 nên giữ. Sale-status control, pricing form, catalogue và seat-status SQL đã có, không ghi đè bằng cây cũ. G2 kiểm lại import transaction/rollback, all-errors, sold/held overwrite guard, giá nguyên đồng, chặn thiếu giá, ownership và catalogue qua suite hiện có. Phần giá snapshot khi đi qua payment còn được xử lý ở G4 sau dependency đơn/mock; không coi riêng test đọc đơn là đã kiểm đủ thanh toán.

| Nhóm | Build | Lint | Typecheck | Test | API E2E | Quyết định |
|---|---|---|---|---|---|---|
| g2-seatmap-pricing-sale (S-05, S-06, S-09, S-15, S-07, S-08) | PASS | PASS (warning có sẵn) | PASS | 604 PASS | 151 PASS | [receipt](../.integration-s123/g2-seatmap-pricing-sale/summary.json) |
| g1-foundations-retry (S-01, S-02, S-04, K-01) | PASS | PASS (warning có sẵn) | PASS | 604 PASS | 151 PASS | [receipt](../.integration-s123/g1-foundations-retry/summary.json) |

Raw/log và manifest ở `.integration-s123/<group>/`; báo cáo cuối nêu rõ phần giữ base, phần nhập mới, các lỗi còn mở và loại bằng chứng. Raw lớn giữ local, receipt/hash được commit. Ma trận `STORY_SOURCE_MATRIX.csv` vẫn là snapshot nguồn audit A/B0, không gán thay đổi integration cho thư mục donor chỉ đọc.

## Các gate còn cần người thật

Review của thành viên khác, xác nhận môi trường và nghiệm thu AC staging, CI đúng SHA/quét dependency còn riêng. Tích hợp local không làm `DoD_complete=true`; bảng STATUS tiếp tục phân biệt Partial với Done đủ DoD.
