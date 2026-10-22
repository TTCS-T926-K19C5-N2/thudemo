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

Các gate PASS và receipt tại `.integration-s123/g1-foundations-retry/`; lần đầu bị guard Redis từ chối được giữ riêng. CI/deploy/staging/rollback thật chưa chạy ở candidate này; giữ S-01 Partial. K-01 thiếu bằng chứng DoD độc lập, giữ Partial. Không suy quyền phê duyệt từ tài liệu K-01 lịch sử.

Lần G1 đầu bị guard suite S-41 từ chối Redis16383; chỉ sửa runner sang Redis16382 của integration, DB8 xác nhận trống. Rerun đầy đủ năm gate pass, không sửa guard. Local launcher `.integration-s123/serve.mjs` compose các entrypoint API/web/expiry hiện có, DB riêng `integration_s123_demo`, cổng3394/3395; smoke thật trả API health200 và web home200, tự dừng đúng tiến trình do nó tạo. Khóa test/credentials bền trong `.git/integration-s123-demo/runtime.json`, không in giá trị, không đưa vào Git. Đăng ký/email transport profile tương tác tắt; luồng đăng ký/kích hoạt được kiểm bằng transport test ở E2E, không tuyên bố email Internet.

## Kết quả nhóm và bằng chứng

### G2 — sơ đồ, giá và mở bán (phần giữ base)

RETAINED theo thứ tự S-05 → S-06/S-09 → S-15 prerequisite → S-07 → S-08. `seat-map.ts` cùng nội dung với các donor có implementation (R22/R19 và nhiều nguồn); parser JSON vị trí dòng/cột chỉ có ở R19 nên giữ. Sale-status control, pricing form, catalogue và seat-status SQL đã có, không ghi đè bằng cây cũ. G2 kiểm lại import transaction/rollback, all-errors, sold/held overwrite guard, giá nguyên đồng, chặn thiếu giá, ownership và catalogue qua suite hiện có. Phần giá snapshot khi đi qua payment còn được xử lý ở G4 sau dependency đơn/mock; không coi riêng test đọc đơn là đã kiểm đủ thanh toán.

| Nhóm | Build | Lint | Typecheck | Test | API E2E | Quyết định |
|---|---|---|---|---|---|---|
| g1-foundations-retry (S-01, S-02, S-04, K-01) | PASS | PASS (warning có sẵn) | PASS | 604 PASS | 151 PASS | [receipt](../.integration-s123/g1-foundations-retry/summary.json) |
| g2-seatmap-pricing-sale (S-05, S-06, S-09, S-15, S-07, S-08) | PASS | PASS (warning có sẵn) | PASS | 604 PASS | 151 PASS | [receipt](../.integration-s123/g2-seatmap-pricing-sale/summary.json) |
| g3-configurable-hold (S-10, S-12, S-13) | PASS | PASS (warning có sẵn) | PASS | 604 PASS | 156 PASS | [receipt](../.integration-s123/g3-configurable-hold/summary.json) |
| g4-registration-orders-payment-retry (S-03, S-16, S-17, S-19, S-20, S-21, S-22, S-23, S-24) | PASS | PASS (warning có sẵn) | PASS | 604 PASS | 156 PASS | [receipt](../.integration-s123/g4-registration-orders-payment-retry/summary.json) |

Raw/log và manifest ở `.integration-s123/<group>/`; báo cáo cuối nêu rõ phần giữ base, phần nhập mới, các lỗi còn mở và loại bằng chứng. Raw lớn giữ local, receipt/hash được commit. Ma trận `STORY_SOURCE_MATRIX.csv` vẫn là snapshot nguồn audit A/B0, không gán thay đổi integration cho thư mục donor chỉ đọc.

### G3 — S-10/S-12/S-13, TTL cấu hình trên lineage A

IMPORTED/ADAPTED từ R27 `83f950563a38`: checkout riêng `apps/api/test/configurable-hold-ttl.e2e-spec.ts`; forward-port phần thân v1 của `202610190004_configurable_hold_ttl` sang **migration mới `202610220012_configurable_hold_ttl`**. Không nhập file migration19/10, wrapper v7 chín trường, caller hoặc quota preflight của donor. V6/v5 và HTTP sáu trường giữ nguyên. Không đổi index, pool, khóa hàng hoặc tối ưu hiệu năng.

TTL là thiết lập PostgreSQL phía server `app.hold_ttl_seconds`, default600; ví dụ cấu hình kết nối API bằng query parameter `options=-c%20app.hold_ttl_seconds%3D120` trong DATABASE_URL riêng. Tái tạo pool sau đổi cấu hình; hold đã có giữ deadline/token, đơn không gia hạn. Không nhận TTL từ body HTTP. Test donor được thích nghi từ `HOLD_TTL_SECONDS`/v7 sang connection option/v6 và guard DB integration hiện có; giữ đủ năm tình huống, gồm transaction-local reset/fallback600.

Năm gate PASS:604 test và156 E2E. Migration **47/47 mới,35→47 upgrade PASS**, fixture hash giữ nguyên; [receipt migration/load](../.integration-s123/g3-migration-load/summary.json). Chạy load **đúng một lần vì S-10 sửa routine**:42/42 correctness/invariant check,10 vòng100 thắng/100 xung đột/100ghế duy nhất,0 lỗi. **p95 tổng353,36ms; vòng1 438,25ms; NFR FAIL (harness exit1 chỉ do ngưỡng300ms)**. Không đo lại tìm lần pass, không tối ưu; giữ rủi ro đã được người dùng cho phép xử lý sau tích hợp. Đây không phải S-10 Done đủ AC/NFR/DoD.

## Các gate còn cần người thật

### G4 — giữ đăng ký/đơn/mock, nối snapshot giá S-15 qua thanh toán

RETAINED: đăng ký S-03 trùng R02/R03/R19; thông báo/consent phiên bản đã duyệt, activation, ownership/session, S-16 expiry gốc, S-17 server total, T-40/mock S-19 và S-20–S-24 được kiểm lại bằng toàn bộ E2E. Không nhập cây donor cũ làm mất contract và các guard. S-18 sandbox thật vẫn ngoài R0.

RESOLVED: các donor đã kiểm và R19 đều đọc `seat.category.price` ở initiate/callback, trong khi luồng tạo đơn đã lưu snapshot `OrderItem.unitPrice`. Ca TC-S15-03 mở rộng chứng minh lỗi trên DB thật: đơn1.200.000đ bị gửi sang gateway1.500.000đ sau đổi giá; [log trước sửa](../.integration-s123/g4-payment-regression/snapshot-before-fix.log). Chỉ nối hai điểm tính tiền với snapshot DB sẵn có theo Backlog!L12; không thay API, schema, query/lock/pool hoặc thuật toán hold. Giữ các unit case, bổ sung trường unitPrice mà DB bắt buộc vào mock; sửa assertion cũ dùng giá hiện hành vì trái AC, không xóa test. TC-S15-03 kiểm cả amount client giả, gateway amount cũ, signed success/replay không nhân vé/thanh toán, và đơn mới lấy giá mới. Teardown chỉ dọn fixture của suite.

## Khởi động và smoke đã chạy

Tại root integration có dependencies/runtime và container audit riêng đã tạo:

```powershell
node .integration-s123/serve.mjs
```

Web `http://localhost:3394`, API `http://localhost:3395`; Ctrl+C dừng đúng các child do launcher tạo. DB demo riêng giữ dữ liệu/keys qua lần chạy. Profile dùng dữ liệu giả/mock; email tắt ở launcher, không gọi SMTP bên ngoài. Credentials/keys nằm trong file riêng dưới `.git` mà launcher chỉ báo đường dẫn; không in giá trị hoặc commit. Đã chạy `--smoke` với health200/home200 ở G1; lần cuối sau G4 cũng health200/home200; [receipt](../.integration-s123/g4-registration-orders-payment-retry/startup.json).

| Luồng smoke | Bằng chứng có trong API E2E/kiểm local |
|---|---|
| Đăng ký → activation/expired/resend | registration, registration-admission; test mail transport, không Internet |
| Login → roles/default-deny/lock/logout | auth-roles, auth-input-regression, sprint1-ip |
| Tạo/sửa sự kiện, suất và ownership | events |
| Import valid/invalid/rollback → giá → mở bán | sprint2, s15-s16-acceptance |
| Đọc ghế → hold → expiry/recovery | seat-hold-api, account-hold-recovery, configurable-hold-ttl |
| Đặt đơn → giá snapshot/deadline → retry | orders, s15-s16-acceptance |
| Mock payment → signature/idempotency/failure/late | mock-gateway, payments, payments-signature-verification, payments-idempotency |
| PAID → ticket/QR → soát lại | tickets, ticket-check-in; hồi quy mã đã có, không phải tích hợp Sprint4 |

Đây là các luồng API trên DB/Redis thật và mock/test transport, không phải bằng chứng toàn chuỗi thao tác UI/camera/email Internet. Không có UI component nào được sửa trong lượt này.

## Mười rủi ro/khoảng trống còn mở

| # | Phạm vi | Kết quả còn thiếu / tác động |
|---|---|---|
| 1 | S-10/S-13 | p95 mới353,36ms, vòng đầu438,25ms; xử lý sau theo chỉ dẫn, không tối ưu lượt này |
| 2 | S-01 | CI/deploy/rollback staging đúng SHA cuối chưa chạy; local startup200 không thay thế |
| 3 | DoD chung | Chưa member review, staging acceptance và dependency scan đúng candidate; Must Done0/32, riêng nhóm này0/19 |
| 4 | S-05/S-06/S-08/S-09/S-17/S-22 | API/unit có kiểm; browser/mobile/2000-seat render và UI polling thực chưa nghiệm thu ở candidate |
| 5 | S-03 | Email activation/resend dùng test transport; launcher tương tác tắt mail, chưa nghiệm thu gửi/nhận staging |
| 6 | S-18 | Sandbox thật ngoài R0, chưa đầu vào/provider proof; mock không đóng story này |
| 7 | S-44 | SSE endpoint404 trong audit; theo chỉ dẫn không chặn, để nhóm6 xử lý/polling/không nhập |
| 8 | S-45–S-48 | Policy hủy/hoàn tiền chưa chốt theo hai nguồn; chưa thuộc lượt này |
| 9 | S-53–S-55 | Phạm vi privacy/backup offhost/restore vận hành còn chưa nghiệm thu; chưa thuộc lượt này |
| 10 | S-56/58/59/60/62/63 | Không có donor usable trong audit; Could/backlog chưa Sprint, không tự phát triển |

Các mục ngoài R0 không tự biến thành blocker tích hợp Sprint1–3. Không có story bị bỏ sau hai lần sửa không qua; G4 lần đầu timeout5s ở ca bulk2000 ghế dù regression giá đã pass, giữ log và rerun cả năm gate trên PostgreSQL test trống riêng15432/RedisDB13, không tăng timeout/đổi code sau lỗi; lần G1 lỗi cấu hình Redis đã sửa và rerun cả năm gate pass. G3 NFR fail được giữ thành rủi ro đã nêu, không đổi thành PASS hoặc DoD Done.

**DỪNG sau Sprint1–3. Chưa lấy thêm code Sprint4–5 hoặc6–8; chờ người dùng xác nhận nhóm tiếp theo.**

Review của thành viên khác, xác nhận môi trường và nghiệm thu AC staging, CI đúng SHA/quét dependency còn riêng. Tích hợp local không làm `DoD_complete=true`; bảng STATUS tiếp tục phân biệt Partial với Done đủ DoD.

Đã kiểm chốt [an toàn nguồn và manifest](../.integration-s123/safety-summary.json); không sửa nguồn/API contract, không push/main/develop hoặc tối ưu hiệu năng. Các container chỉ thuộc integration được dừng, dữ liệu giữ lại.
