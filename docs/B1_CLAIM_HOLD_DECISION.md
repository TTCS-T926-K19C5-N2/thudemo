# B1 — chọn lineage claim_hold, chưa tích hợp

Ngày 22/10/2026 (Asia/Saigon). Nhánh `integration/candidate-1`, nền sản phẩm `ae40a3772210`. B0 đã commit cấu hình tại `cdcac8b17424cb90e93a6a97f3ce15f1d579e7ee`; CSV được commit thành các phần 321/320/320/320/320/128 dòng để giữ giới hạn khoảng 400 dòng mỗi commit.

**B1 chỉ đọc và so sánh. Chưa sửa/tạo/chạy migration, chưa đổi caller/SQL/API, chưa restart hay triển khai staging. Dừng chờ người dùng chọn A hoặc B ở cuối tài liệu.**

## 1. Hai họ v5/v6 có cùng tên nhưng khác nghĩa

Các routine v5/v6 dưới đây cùng có input signature `(uuid, uuid, text, uuid[], uuid, uuid)` trong schema `public`.

| Họ / routine | Migration | Chức năng và thứ tự gọi | Kết quả |
|---|---|---|---|
| 19/10: v5 — account recovery, R05/R12/R27 | `202610190002_account_hold_recovery` | Khoá buyer; đếm round còn hạn; nhiều round cũ thì H0006; chọn lại locator theo account; gọi **v4** | 6 trường lõi |
| 19/10: v6 — quota, R12/R27 | `202610190003_atomic_account_quota` | Khoá buyer và suất; đếm distinct ghế đang giữ + đã mua/NEEDS_REVIEW; loại yêu cầu vượt quota bằng H0007; gọi **v5 recovery** | **9 trường**: 6 lõi + `quotaLimit`, `owned`, `requested` |
| 22/10: v5 — quota/demo/audit, candidate R19 | `202610220001_sprint_foundations` | Khoá buyer; đặt actor audit; chặn suất demo H0008; đếm union ghế giữ, đơn pending còn hạn, PAID/NEEDS_REVIEW và ghế yêu cầu; H0007 nếu vượt; gọi **v4** | **6 trường** |
| 22/10: v6 — account recovery, candidate R19 | `202610220005_account_hold_recovery` | Khoá buyer; chặn nhiều round cũ bằng H0006; phục hồi locator account; gọi **v5 quota/demo/audit** | **6 trường** |

Sáu trường lõi theo đúng thứ tự: `failure`, `rejectedSeatIds`, `serverTime`, `id`, `expiresAt`, `seatIds`.

Vì vậy thứ tự gọi khác nhau: họ 19/10 là **quota-v6 → recovery-v5 → v4**; họ 22/10 là **recovery-v6 → quota-v5 → v4**. Không chọn bằng tên “v6 mới hơn v5”.

Caller của quota cũ còn đưa `limit`, `owned`, `requested` vào response lỗi `TICKET_LIMIT`. Caller hiện tại trả lỗi theo contract hiện tại, không có ba trường đó. Chép nguyên service cũ có thể đổi hợp đồng API; B1 không thực hiện việc này.

TTL là một phần riêng: source R27 thực tế gọi **v7**, không gọi v6 trực tiếp. Migration `202610190004_configurable_hold_ttl` thêm v7 và sửa thân routine qua migration forward để nhận TTL server-side, mặc định 600 giây. Không được lấy riêng v6 rồi tuyên bố đã lấy cả TTL cấu hình. Slice S-10 phải đối chiếu riêng yêu cầu tham số cấu hình, giữ default R0 10 phút và không gia hạn round cũ.

## 2. Bản nào đã dùng trên staging?

**Bằng chứng staging hiện tìm được gắn với v4, chưa chứng minh họ v5/v6 nào đã được triển khai lên staging này.**

| Bằng chứng vừa đọc lại | Kết luận có thể xác nhận |
|---|---|
| `.sprint1-staging/active.json` của profile `sprint1-laptop-20261015` | Active pointer vẫn là `34deec00c18ac987a7db56e9d1c61abac2222bca`; previous là `14a5d3ff8ea2...` |
| `git show 34deec00:apps/api/src/holds/holds.service.ts` | Caller dùng `SELECT * FROM public.claim_hold_v4(...)` |
| `git ls-tree 34deec00 apps/api/prisma/migrations` | Chuỗi migration của release này chưa có các migration v5/v6 kể trên |
| `portable-final-staging-release.json` và `portable-final-staging-smoke.json` | Receipt deploy/smoke đúng SHA34deec00 ngày 20/10/2026 giờ Việt Nam; HTTPS và rollback tại thời điểm đó |
| Read-only Docker inspect ngày 22/10/2026 | API, replica và web của active pointer đều `exited`, `Running=false`; các cổng loopback 3470–3476 không lắng nghe |

Đây là xác nhận **lịch sử đã triển khai** cộng **trạng thái hiện tại đang dừng**, không phải staging đang khỏe. Không khởi động lại container, đọc `.env`, in cấu hình bí mật hoặc gửi request thay đổi dữ liệu staging.

Đường dẫn nguồn lịch sử: `D:\Development\03_Academic\Bán vé sự kiện có sơ đồ ghế\outputs\master-plan-20261019-01\evidence\portable-final-staging-release.json` và `portable-final-staging-smoke.json`. Bản snapshot sanitised, hash và trạng thái hiện tại nằm trong [proof-summary.json](../.integration-b1/proof-summary.json) và [evidence.json](../.integration-b1/evidence.json).

## 3. Bản nào pass 200 yêu cầu / 100 ghế?

Tách **correctness** (100 thắng + 100 xung đột, không bán trùng) khỏi **NFR p95 <300ms**. Không dùng CI budget 800ms thay yêu cầu sản phẩm.

| Routine / đúng source | Bằng chứng tải 200/100 ×10 | Correctness | p95 / NFR | Staging |
|---|---|---|---|---|
| **v5 recovery cũ**, source `d092ec899293bdc0af91650de155fa259b35a759` | Raw artifact T31 run `39216200824`; 2 process Nest + PG/Valkey trên CI; SHA-256 raw khớp receipt; 2.000 mẫu được đếm lại | **PASS**: cả 10 vòng đều 100 HTTP200 +100 HTTP409, 0 lỗi; 100 active rights/100 ghế unique mỗi vòng; 45 checks | **422,657898ms toàn bộ: FAIL ngưỡng300**. First burst576,073909ms; steady298,792227ms không thay tổng. CI800ms PASS | Raw ghi `staging=false`, `ciRun=true` |
| **v6 quota cũ**, source hiện có `f72056e092ff...` | Chưa tìm thấy raw200/100 gắn đúng routine/source này trong phần evidence đã đối chiếu | **NOT VERIFIED cho bài tải này** | NOT VERIFIED | Chưa có bằng chứng triển khai |
| **v6 candidate**, source `ae40a3772210...` | A có 151/151 E2E trên DB riêng và runtime quota/recovery, nhưng không có bài200/100 ×10 mới cho đúng candidate này | **NOT VERIFIED cho bài tải này** | NOT VERIFIED | Chưa có bằng chứng triển khai |
| v4, source benchmark lịch sử `a2e5f675a371...` | `evidence/sprint1/20261016-closeout/performance-summary.json` và raw/correlation | Các lượt hợp lệ ghi correctness PASS; giữ cả lượt preflight fail | HTTP2 có 233,14 /223,16 /263,47ms theo profile cụ thể; HTTP1 cold737,97ms FAIL. Tổng kết lịch sử vẫn FAIL, không gom thành một PASS chung | Laptop HTTPS lịch sử, source khác release34deec00; không gán số đo này cho v5/v6 hoặc HEAD hiện tại |

V5 CI được kiểm lại bằng cách đọc raw, không chỉ đọc dòng PASS trong báo cáo: đúng 10 vòng, 200 mẫu/vòng, histogram trạng thái `{200:100,409:100}`, số quyền giữ và ghế unique đều100, hash raw trùng `rawSha256` trong summary. `git show d092ec8:...holds.service.ts` xác nhận gọi v5.

Nguồn raw: `outputs/master-plan-20261019-01/raw/mip008-t31-ci-d092ec8/http-concurrency.json`. Summary: `outputs/master-plan-20261019-01/evidence/mip008-ci-hold-summary.json`. Hai đường dẫn đều nằm trong workspace gốc, chỉ đọc.

Quota cũ có receipt local 62 unit +9 account regression +54 regression PASS; TTL có 54 regression và397 unit PASS. Những receipt này **không có sourceSha trong JSON**, nên chỉ là evidence hỗ trợ lịch sử, chưa đủ gán thành kiểm tải/exact-HEAD acceptance. Không nâng thành v6 pass200/100.

B1 không chạy lại tải lên staging hoặc áp migration thử. Bằng chứng benchmark hiện tại được giữ đúng ngày/SHA/môi trường; không bỏ first burst, không lấy steady thay tổng, không suy CI xanh thành NFR sản phẩm xanh.

## 4. Vì sao không chép migration cũ hoặc sửa file đã áp dụng?

- Hai file khác tên vẫn `CREATE FUNCTION public.claim_hold_v5/v6` với cùng input signature; thêm cả hai họ sẽ đụng đối tượng SQL.
- Đổi v6 từ9 xuống6 trường không thể giải quyết bằng đổi mỗi `CREATE` thành `CREATE OR REPLACE`: PostgreSQL15 không cho đổi return type của function hiện hữu bằng lệnh đó. Đây là quy tắc kỹ thuật, không phải yêu cầu nghiệp vụ mới. [PostgreSQL15: CREATE FUNCTION](https://www.postgresql.org/docs/15/sql-createfunction.html).
- Không sửa migration đã áp dụng, không DROP/RECREATE hàm đang dùng để ép đi tiếp, không xóa `_prisma_migrations`, không `migrate resolve` giả để bỏ qua file xung đột, không reset/db push.
- 42 migrations chạy từ DB trống ở audit A không chứng minh upgrade từ một DB đã áp họ migration19/10.
- Đặc biệt: chỉ thêm một migration sau cùng chưa tự chữa được DB legacy. Nó có thể fail ngay ở migration22/10 tạo v5 trước khi tới migration hòa giải mới. Phải kiểm lineage trước khi `migrate deploy` và dừng khi gặp trạng thái ngoài danh sách đã duyệt.

## 5. Hai phương án để chọn

### A — Giữ lineage22/10 của candidate — khuyến nghị

Chọn **v6 recovery → v5 quota/demo/audit → v4**, return6 trường và contract HTTP của candidate hiện tại. Không lấy các migration `202610190002_account_hold_recovery`, `202610190003_atomic_account_quota` hoặc caller9 trường từ donor cũ.

Phạm vi nếu chọn A:

1. Không thêm SQL chỉ để đổi tên. Dùng chuỗi đã có ở `ae40a377`; B0 không thay chuỗi này.
2. Đối chiếu từng hành vi/test của các donor với AC, chỉ lấy phần thiếu bằng slice nhỏ; không “replay” code đã có.
3. Chỉ chấp nhận DB mới hoặc DB có lineage tương thích đã kiểm từ release staging v4. Trước khi triển khai phải read-only kiểm `_prisma_migrations`, definition/return type/hash của routine và compatibility/rollback. B1 hiện chưa kiểm schema DB staging vì container đang dừng; không được tự coi nó đã tương thích.
4. Nếu một yêu cầu còn thiếu như TTL cấu hình cần đổi SQL, tạo **migration forward mới** ở slice tương ứng, giữ checksum/file cũ và deadline/token/dữ liệu. Nếu lại gặp conflict schema hoặc buộc đổi contract API, dừng báo ngay.
5. Rerun 200/100 ×10 đúng candidate và giữ tất cả mẫu; kiểm quota đồng thời, khác phiên/account, legacy split, stale token, payment-expiry race và callback trễ. Chưa có kết quả mới thì giữ NOT VERIFIED, không gán PASS từ v5 cũ.

Ưu điểm: ít thay đổi nhất, giữ demo guard/audit/contract đang có và evidence local151 E2E. Rủi ro còn nguyên: chưa có tải đúng HEAD và staging của v6 này, chưa đóng AC/NFR. DB đã dùng họ19/10 bị chặn, không tự migrate vào chuỗi22/10.

### B — Tạo routine hòa giải tên mới bằng migration forward

Nếu cần một routine có định nghĩa riêng, chọn tên chưa dùng, ví dụ `claim_hold_integration_v1`, thay vì gán hai ý nghĩa khác nhau cho v5/v6.

Phạm vi nếu chọn B:

1. Viết migration mới sau migration cuối của lineage được chọn; giữ nguyên v1–v7 và mọi file đã áp dụng. Không chép cả cây migration19/10.
2. Routine mới kết hợp các hành vi đã có cần thiết theo AC: khóa account/seat đúng thứ tự, original expiry, account recovery, quota distinct, demo rejection, actor audit và fencing. Return6 trường lõi; giữ nguyên mã/shape HTTP hiện tại. Không thêm nghiệp vụ hay đổi thuật toán giữ ghế nền.
3. Chỉ đổi caller và whitelist/cache tên statement trong slice riêng sau khi routine mới đã có và được kiểm. Có thể rollback image về caller cũ vì function cũ còn nguyên; phải kiểm thực trên DB tạm.
4. Chạy cùng ma trận correctness/concurrency/NFR như A, cả fresh install và upgrade từ bản v4 đã có dữ liệu. Tách các commit dưới khoảng400 dòng; không bắt đầu phần sau khi gate trước fail.
5. Phương án B **cũng không tự cho phép nâng cấp DB đã áp họ19/10** qua các migration22/10 xung đột. Nếu phải bảo toàn và nâng cấp một DB legacy như vậy, dừng trước deploy và trình một kế hoạch chuyển lineage riêng, có inventory/backup/compatibility; không dùng rename/drop/metadata bypass ngầm.

Ưu điểm: tên mới gắn đúng một contract, tránh nhập nhằng version khi tích hợp tiếp. Đổi lại: thêm SQL và phạm vi test; chưa có bằng chứng tải hay staging cho routine mới, không cần thiết nếu A đã giữ đủ hành vi. Đây là đề xuất có điều kiện, chưa có file SQL được tạo.

## 6. Gate sau khi người dùng chọn

Thứ tự vẫn là Deps và nhóm **Sprint1–3 → dừng báo → Sprint4–5 → dừng báo → Sprint6–8 → dừng báo**. Mỗi báo cáo nhóm ghi build/lint/typecheck/test/E2E thực chạy và ca không tích hợp được.

S-44 không là blocker cho thứ tự trên. Khi tới slice đó sẽ giữ trong danh sách không tích hợp hoặc lấy/cấu hình polling nếu đáp ứng AC đã có; chưa sửa UI/API ở B0/B1. Không tự dùng S-44 để trì hoãn Sprint1–3.

**Đề nghị chọn A hoặc B. Không tiếp tục tích hợp trước câu trả lời này, đúng điểm dừng B1 người dùng yêu cầu.**

Evidence B0: [B0_TEST_GATE_AND_MATRIX.md](B0_TEST_GATE_AND_MATRIX.md). Ma trận: [STORY_SOURCE_MATRIX.csv](STORY_SOURCE_MATRIX.csv). Các source thudemo* vẫn chỉ đọc; không push, đổi main/develop hoặc chỉnh dữ liệu đang dùng.
