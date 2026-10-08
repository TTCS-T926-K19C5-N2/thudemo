# S-31 — Ma trận bằng chứng

Ngày: 08/10/2026, Asia/Saigon. **S-31 chưa đạt nghiệm thu; candidate storage proof đã kiểm local.** Revision triển khai được ghi trong `S31_GITHUB_HANDOFF.md`; SHA-256 của SQL được ghi trong `evidence/s31/storage-proof.json` để gắn bằng chứng đúng nội dung.

## Kết quả local

Node 24.21.0, pnpm 10.15.1, Prisma 7.10.0, PostgreSQL 15. Database cách ly `s31_storage_verification`, container riêng `thudemo-s31-storage-verification-20261008`, host loopback port 15436. Không đọc/reset dữ liệu database các task khác. Deploy đầy đủ 18 migration repository thành công, sau đó tạo schema fixture `s31_verification` (không phải migration sản phẩm).

`node apps/api/scripts/verify-s31-storage.mjs`: **11 checks PASS**, 50 race rounds, hai OS process Node với PID khác nhau và hai kết nối PostgreSQL thật. Kiểm số dòng trực tiếp sau từng vé: mỗi race đúng một NORMAL. Đây không phải hai API instance hoặc hai phiên nhân viên thật. Worker restart là restart client dữ liệu, không phải API restart.

Hồ sơ máy đọc: [`storage-proof.json`](../evidence/s31/storage-proof.json). Kết quả p95 trong JSON chỉ là thời gian một vòng cạnh tranh candidate ở local; không phải NFR API scanner dưới 500 ms, không phải T-31 giữ ghế.

Kiểm dữ liệu thêm: retry cùng request key → một ADMITTED và một ALREADY_RECORDED; key bị tái sử dụng khác ticket/cửa → REQUEST_CONFLICT; vé thiếu/hủy/sai suất không trả metadata; duplicate direct insert vi phạm partial unique index; lỗi sau insert trong transaction → rollback không còn admission; reason NULL/rỗng/spaces/tab/newline/dài quá 500 bị constraint từ chối; direct EXCEPTION fixture giữ NORMAL và scan thường tiếp theo vẫn bị từ chối. Test exception là insert fixture, **không chứng minh permission, owner verification hoặc endpoint**.

Chạy harness lại trên cùng database: từ chối có chủ đích vì schema/lịch sử đã tồn tại; dữ liệu không bị xóa. Để chạy lần tiếp theo, cấp database/container kiểm thử mới theo runbook, hoặc dùng môi trường CI mới. Không tự drop/reset bản đang chạy.

| Kiểm tra                                                                       | Kết quả local       | Giới hạn                                                                                         |
| ------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------ |
| Install frozen lockfile                                                        | PASS                | Đúng pnpm 10.15.1                                                                                |
| Prisma migrate deploy / generate                                               | PASS                | 18 migration gốc trên database riêng                                                             |
| Format scripts mới                                                             | PASS                | Prettier --check; SQL chưa có formatter trong repo                                               |
| Lint toàn repo                                                                 | PASS                | Bốn warning sẵn có ở API trên main; không chỉnh ngoài S-31                                       |
| Oxlint scripts mới                                                             | PASS                | Không lỗi                                                                                        |
| Typecheck API/web                                                              | PASS                | next typegen trước check                                                                         |
| Build API/web                                                                  | PASS                | Không đổi UI/runtime sản phẩm                                                                    |
| Unit tests                                                                     | PASS                | API 147, web 35 (182 tổng)                                                                       |
| Candidate PostgreSQL integration                                               | PASS                | 11 checks; 50 race rounds                                                                        |
| API E2E local có sẵn                                                           | Chưa chạy           | Harness cố định 127.0.0.1:15432/sprint2_integration; cổng đang thuộc task khác, không dùng DB đó |
| API E2E CI có sẵn                                                              | Xem handoff/Actions | Chạy môi trường CI cách ly, không chứng minh S-30 chưa tồn tại                                   |
| S-30 regression / scanner API / QR                                             | BLOCKED             | Không có implementation dependency                                                               |
| Browser desktop/mobile, two sessions, focus/dialog/live region/timeout/console | Chưa kiểm           | Không có màn hình scanner để render                                                              |
| Camera thiết bị thật, QR ảnh/video fixture                                     | Chưa kiểm           | Không suy storage proof thành bằng chứng camera                                                  |
| Staging / production                                                           | Chưa kiểm           | Chưa merge, chưa deploy                                                                          |

## AC/NFR → implementation → test → kết quả → artifact → revision

| Yêu cầu                               | Implementation trong PR                                | Test                                                     | Kết quả nghiệm thu                            | File/link                        | SHA                            |
| ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------- | -------------------------------- | ------------------------------ |
| AC1: lần thứ hai ở B trả 19:02/cửa A  | Candidate NORMAL ledger + lookup original              | Check 2, DB fixture thời gian 12:02 UTC = 19:02 Việt Nam | **Chưa kiểm trên sản phẩm**; candidate PASS   | SQL/harness + storage-proof.json | implementation SHA tại handoff |
| AC2: hai scanner chỉ một hợp lệ       | Candidate lock + unique partial index                  | Check 3/8: 50 races hai process, đếm DB                  | **Chưa kiểm qua API/session**; candidate PASS | SQL/harness + JSON               | implementation SHA tại handoff |
| AC3: ngoại lệ đúng quyền, reason, tên | Thiết kế RBAC/endpoint/UI; candidate ledger constraint | Check 10/11 chỉ insert trực tiếp                         | **BLOCKED**: policy và S-30 chưa có           | S31_IMPLEMENTATION.md + JSON     | implementation SHA tại handoff |
| NFR atomic DB                         | PostgreSQL row lock + partial unique index             | Check 3/8/9                                              | Candidate PASS; chưa tích hợp production      | SQL/harness                      | implementation SHA tại handoff |
| Retry không thêm entry                | Candidate actor/request unique + replay code           | Check 4/5                                                | Candidate PASS, contract S-30 chưa đối chiếu  | SQL/harness                      | implementation SHA tại handoff |
| Restart giữ used                      | Ledger persisted                                       | Check 6                                                  | Worker DB restart PASS; API restart chưa kiểm | JSON                             | implementation SHA tại handoff |
| Rollback không dở dang                | Used state suy từ NORMAL                               | Check 9, DB lỗi giữa transaction                         | Candidate PASS; production chưa kiểm          | JSON                             | implementation SHA tại handoff |
| Giữ V1                                | Không sửa file apps/web                                | Diff                                                     | Không đổi UI; render S-31 chưa kiểm           | PR diff                          | PR head                        |

## 13 kịch bản API bắt buộc và khoảng trống

| #   | Kịch bản                             | Bằng chứng có                            | Trạng thái API                     |
| --- | ------------------------------------ | ---------------------------------------- | ---------------------------------- |
| 1   | Lần đầu đúng actor/cửa/time          | Candidate check 1                        | BLOCKED S-30                       |
| 2   | Quét lại khác cửa, metadata đầu      | Candidate check 2                        | BLOCKED S-30                       |
| 3   | Hai session/cửa đồng thời            | Hai DB process check 3                   | BLOCKED: chưa có hai session       |
| 4   | Nhiều lượt, đếm DB                   | 50 races check 3                         | DB candidate PASS; API BLOCKED     |
| 5   | Hai API instance                     | Hai DB worker, không API                 | Chưa kiểm                          |
| 6   | Restart API                          | Restart DB worker check 6                | Chưa kiểm                          |
| 7   | QR sai/sai suất/vé không hợp lệ      | Status/suất candidate check 7            | QR BLOCKED                         |
| 8   | Sai quyền, không lộ metadata         | Chỉ eligibility candidate                | RBAC BLOCKED                       |
| 9   | Ngoại lệ có quyền và lý do           | Direct EXCEPTION fixture check 11        | Policy/endpoint BLOCKED            |
| 10  | Thiếu reason/sai quyền/danh tính giả | Constraint reason check 10               | Identity/RBAC BLOCKED              |
| 11  | Retry scan/ngoại lệ                  | Check 4/5, unique EXCEPTION key check 11 | HTTP/idempotency exception BLOCKED |
| 12  | Scan thường sau ngoại lệ             | Check 11                                 | Candidate PASS; API BLOCKED        |
| 13  | Transaction rollback                 | Check 9                                  | Candidate PASS; API BLOCKED        |

Không AC nào được đánh Done/PASS đầy đủ chỉ nhờ CI xanh. Issue phải mở và PR Draft cho đến khi dependency, policy, API/browser và DoD staging có đủ bằng chứng. Screenshot desktop/mobile chưa có vì chưa có scanner S-30; không dùng ảnh thiết kế/demo thay render thật.
