# Báo cáo kiểm tra local demo — R77

**Kết luận: DEMO_PARTIAL. Chưa đủ bằng chứng để ghi DEMO_READY.**

Cây nguồn `D:\Merge_2\Codegym`, nhánh `feature/sprint-4-8-complete`, HEAD `ce777bd13e472c089eef4a3c1ed4455e501ae3ba`; dirty tree được giữ nguyên. Không commit/push/merge/deploy. Profile cô lập `s1demo-384da3d43b41`: R65 official Restart/build đã trả READY trên source khi đó; sau R72 thay đổi worker template/local env, active endpoints vẫn phản hồi nhưng official Status đánh dấu source stale và yêu cầu Restart. API :3001/Mailpit :24931 chưa nạp setting mới. DB chính không được đụng tới.

## Checkpoint mới nhất · R77

- R77 — Added a 32-row role matrix, walkthrough, local account guide and concise handoff; sanitized inspection confirmed seven synthetic accounts in the ignored private profile and copied no secrets. Clean package and full role run remain unverified.
- R76 — R75 reused post-fix desktop/mobile browser and independent PostgreSQL proof; timestamps show relevant source files were updated before that proof and current canonical/prepared hashes match, although the bundle itself has no embedded hash. S-57-AC01 PASS. INT-16.03 PASS for recipient entitlement/new QR, old QR revocation, privacy, unchanged order totals/items, audit and durable outbox. Because actual SMTP receipt was not checked, the compound INT-16.01 is NOT_RUN and INT-16.04 is BLOCKED pending safe restart and Mailpit. INT-16.02 remains NOT_RUN for reschedule/cancel/erasure/scanner. Three focused API suites passed 44/44. Original failure is retained in the earlier run.
- R74: RAM trống 0,61GiB; official launcher Status vẫn từ chối READY do source R72 chưa build lại. Không restart, không ghi DB, chưa tạo reset token/email. Trong 90 Ready/Must chưa PASS, nhóm còn mở: Thanh toán 19, Sơ đồ và giá 18, Giữ ghế 13, Đối chiếu tổng thể 12, Tài khoản 8, Hạ tầng 7, Sự kiện 6, Đơn hàng 5, Khám phá 2. Acceptance results giữ nguyên.
- Prepared source comparison: 183/185 dirty or untracked non-evidence files are byte-identical to the canonical tree. The only two differences are documentation (`DEMO_HANDOFF.md` updated after the copy and the 5-hour prompt file); no app, package, migration, demo-data or asset mismatch. The R65 runtime remains stale after the R72 launcher/environment change.

- Full monorepo regression trước R60: API 61 files/481 tests, web 29 files/168 tests, deployment/laptop 20 tests PASS; không fail/skip. TypeScript typecheck PASS; ESLint exit 0, còn 2 warning unused-variable trong browser harness. Build source R46 thành công qua launcher Restart trước khi áp dụng R60. R60 focused typecheck/lint PASS.
- Browser thật local: desktop 1280×720 và mobile 390×844. Search “Số 186” tìm được kết quả ngoài trang đầu; lọc Bắc Ninh trả đúng 2 suất; desktop sort giá tăng dần tải đủ 43 suất (190.000₫→450.000₫); không lỗi trang/tràn ngang.
- PostgreSQL oracle chỉ đọc sau restart: 40 sự kiện, 44 suất, 5 đơn, 5 vé. Không reset/seed fixture/write/provider call trong R47. Catalog và order/ticket demo còn nguyên.
- R48 mobile Organizer: past datetime bị chặn, hiện lý do và không gọi endpoint ghi; duplicate exact-time được lưu và cảnh báo; cross-owner bị UI chặn bằng HTTP 403. Fixture duy nhất được tạo qua UI với run tag, không tạo order/seat/ticket; cleanup exact-scope khôi phục counts về baseline 40 event/44 showtime/5 order/5 ticket/5904 seat.
- R49 role check: Organizer thấy mục Sự kiện và không thấy Đối soát kế toán trên browser. Synthetic Buyer direct POST /events nhận 403 và không tạo event. Runtime log clause chưa chứng minh vì detached worker không persist stdout/stderr; source Logger.warn không được tính bằng chứng runtime, nên parent và child log assertion còn BLOCKED.
- R50 account lockout: năm mật khẩu sai trả 401; Redis account lock được đặt; lần thứ sáu trên UI mobile trả 429, retryAfterSeconds=899 và thông báo 15 phút. Các key Redis/TTL trước test được phục hồi; không DB/provider write.
- R51–R52: lần đầu selector nhãn không thu được phiên; oracle read-only xác nhận Buyer hợp lệ. R52 dùng đúng input IDs, API login/me/privacy trả 200 và UI mở sơ đồ đủ 120 ghế; không có business write. R51 là bằng chứng harness chưa đủ, không phải bug sản phẩm.
- R53: hai Buyer ở hai browser context; Buyer A giữ A-3, Buyer B tải lại và thấy ghế đang giữ. Buyer A nhả ghế qua UI; cleanup gỡ đúng HoldSession rỗng do run sau khi xác minh không ghế/đơn liên kết; counts về baseline. S-09-AC02 PASS.
- R54: session mới được hết hạn có kiểm soát; credentialed /api/auth/me trả 401 và UI chuyển về login, giữ returnTo. Session thử được xóa chính xác; Redis và dữ liệu đơn/vé không đổi. S-02-AC04 PASS.
- R56: DB oracle xác nhận suất DRAFT không seat map, 0 ghế; browser desktop hiện đúng “Suất diễn chưa mở bán hoặc đã đóng.”, không render canvas/lưới ghế và không chuyển login; public detail API 404. S-09-AC03 PASS; không ghi DB/provider.
- R57: browser touch 390×844 phóng sơ đồ từ 62% lên 82%, chạm đúng A-3; inspector xác nhận ghế đã chọn, POST giữ ghế 200 và PostgreSQL xác nhận đúng Buyer. UI nhả ghế 200; cleanup exact HoldSession rỗng run-created đưa baseline về 5 đơn/5 vé/4 session/0 hold. S-09-AC05 PASS.
- R58: hai Buyer cùng tải A-3 trống; A giữ qua UI/API 200. Để tái tạo trạng thái snapshot cũ, luồng SSE của B được chặn có chủ đích trong harness; B vẫn thao tác UI, submit nhận 409, thấy cảnh báo “Ghế A-3 vừa được người khác giữ” và sơ đồ tự refresh thành HELD. A nhả 200, DB về 5 đơn/5 vé/4 session/0 hold. S-10-AC02 PASS.
- R59: synthetic Buyer chọn A-3/A-4/A-5 cách nhau 1,1 giây; một UI POST 200 tạo ba hold có expiresAt giống hệt và một đồng hồ 10:00. UI hiện đúng thông báo thời hạn tính từ lần máy chủ đầu tiên xác nhận và ghế thêm không gia hạn. Nhả ba ghế qua UI; DB baseline được phục hồi. S-10-AC03 PASS.
- R61: tại thời điểm đó coupon service unit regression chạy 1 file/5 tests PASS; RAM 1,13GiB nên profile còn dừng. Trạng thái này được cập nhật ở R65 sau khi RAM đạt guard và Restart thành công.
- R62: bốn API unit suite cho mock gateway/payment-webhook, ticket delivery retry và signing chạy 60/60 PASS. Đây chỉ là unit evidence; không khẳng định concurrency PostgreSQL, UI, SMTP hoặc sandbox provider.
- R63: API scanner/check-in 34 tests và web offline-scanner 17 tests PASS (7 files/51 tests). Chỉ là unit evidence; chưa chứng minh browser, DB, camera, thiết bị hay 4G.
- R64: auth controller/service, registration, activation delivery, web login và activation 6 files/48 tests PASS. Password-reset end-to-end, DB consent, browser actions và Mailpit delivery chưa được kiểm bằng R64.
- R60: build cũ tái hiện lỗi cụ thể. R65: sau Restart tại 2,21GiB free RAM, bundle mới giữ đúng thông báo dù follow-up GET /seats trả 404; POST 409, không tạo hold, không lỗi trang, exact status/data counts khôi phục. S-10-AC04 PASS. Oracle catalog sau restart ghi 40 event/44 suất/5 đơn/5 vé.
- R72: phát hiện `PASSWORD_RESET_WORKER` chưa bật trong template demo, dù SMTP đã là Mailpit loopback. Đã bật worker chỉ trong launcher/profile demo và unit core 13/13 PASS. Active API chưa nạp cấu hình mới; RAM mới đo 1,67GiB dưới guard Restart 2GiB nên chưa gửi yêu cầu reset. Official Status vẫn từ chối READY vì source đổi sau build; Mailpit runtime row BLOCKED, chưa tạo token/email fixture.
- R73: official launcher Status được kiểm lại và vẫn báo source stale; RAM trống 1,67GiB, dưới ngưỡng Restart 2GiB. Không restart, không ghi DB và không tạo token reset. Handoff được sửa để bỏ mâu thuẫn READY cũ. Acceptance results giữ nguyên.
- R71: đủ năm tài khoản giả đăng nhập UI; `/auth/me` xác nhận đúng role, route Admin/Organizer/Buyer/Staff/Accountant hiện đúng màn hình, logout 200, không page error và không ghi dữ liệu nghiệp vụ. Hai lần chạy đầu của harness giả định sai `returnTo` cho route quản trị; kiểm tra đã đổi sang mở route trực tiếp sau login, không quy thành lỗi sản phẩm.
- R70: full regression sau khi source mới được build/chạy: API 61 files/481 tests, web 29 files/168 tests, deployment/laptop 20 tests PASS; không fail/skip. Focused typecheck/lint R60 PASS; official Restart build R65 và Status READY. Đây là regression, không lấp các ca acceptance còn NOT_RUN/BLOCKED.
- R69: harness PostgreSQL riêng cho S-15/S-16 xác nhận đúng DB loopback tách biệt, nhưng `prisma migrate deploy` dừng vì schema engine trước khi chạy test. Không áp migration/test nào; container test được dừng, volume giữ lại; profile demo vẫn READY. Đây là BLOCKED môi trường.
- R67: trang chi tiết Bệnh sĩ mở được trên desktop 1280×720 và mobile 390×844; thấy đúng tên/địa điểm/lịch/giá và 4 liên kết suất/chọn ghế, không JS error/tràn ngang. Hai lần chạy harness trước không qua do Windows output path và selector mobile ẩn; sau khi sửa harness lần cuối PASS, không quy chúng thành lỗi sản phẩm.
- R66: sau khi build/restart, browser desktop+mobile kiểm lại catalog; search xuyên trang thấy Số 186, lọc Bắc Ninh còn 2 suất, sort tăng dần đủ 43; không JS error/tràn ngang. Oracle PostgreSQL giữ 40 sự kiện/44 suất/5 đơn/5 vé và rehearsal ON_SALE.
- BUG-R46-01 (P2, mobile search chỉ xét trang đầu) đã sửa; test đỏ trước/sáng sau và browser retest có evidence.
- Inventory base 494 rows plus 6 split assertions = 500 source-derived rows: PASS 162, FAIL 0, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1. Supplemental rows: 21 (PASS 18, BLOCKED 3). R76 records S-57-AC01 and INT-16.03 as PASS from the post-fix browser/PostgreSQL evidence, while keeping the compound transfer-email assertion open (INT-16.01 NOT_RUN; INT-16.04 BLOCKED) and broader lifecycle INT-16.02 NOT_RUN. Three focused transfer-related API suites passed 44/44. Combined rows: 521; PASS 180, FAIL 0, NOT_RUN 326, BLOCKED 9, NEEDS_DECISION 5, MISSING 1. Ready/Must non-PASS remains 90.

## Kết quả theo tier (500 source-derived rows)

| tier | Tổng | PASS | FAIL | NOT_RUN | BLOCKED | NEEDS_DECISION | MISSING | NOT_APPLICABLE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GOVERNANCE | 23 | 0 | 0 | 23 | 0 | 0 | 0 | 0 |
| IMPLEMENTED_OR_PROPOSED | 51 | 37 | 0 | 14 | 0 | 0 | 0 | 0 |
| Later | 82 | 37 | 0 | 39 | 1 | 4 | 1 | 0 |
| Next | 71 | 28 | 0 | 42 | 1 | 0 | 0 | 0 |
| Ready | 163 | 60 | 0 | 100 | 2 | 1 | 0 | 0 |
| TECHNICAL | 110 | 0 | 0 | 108 | 2 | 0 | 0 | 0 |

## Kết quả theo mức ưu tiên (500 source-derived rows)

| priority | Tổng | PASS | FAIL | NOT_RUN | BLOCKED | NEEDS_DECISION | MISSING | NOT_APPLICABLE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Could | 42 | 32 | 0 | 7 | 0 | 2 | 1 | 0 |
| Must | 188 | 66 | 0 | 118 | 3 | 1 | 0 | 0 |
| P0 | 37 | 32 | 0 | 5 | 0 | 0 | 0 | 0 |
| P1 | 14 | 5 | 0 | 9 | 0 | 0 | 0 | 0 |
| Should | 87 | 27 | 0 | 57 | 1 | 2 | 0 | 0 |
| Theo quy định gốc | 14 | 0 | 0 | 14 | 0 | 0 | 0 | 0 |
| Theo scope Sprint | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| Theo story cha | 110 | 0 | 0 | 108 | 2 | 0 | 0 | 0 |

## Kết quả theo nhóm yêu cầu (500 source-derived rows)

| group | Tổng | PASS | FAIL | NOT_RUN | BLOCKED | NEEDS_DECISION | MISSING | NOT_APPLICABLE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Báo cáo và dữ liệu | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| Core flow browser slice — INT-12 | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| Điều kiện nghiệm thu | 14 | 0 | 0 | 14 | 0 | 0 | 0 | 0 |
| Đối chiếu tổng thể | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 0 |
| Đơn hàng | 26 | 5 | 0 | 21 | 0 | 0 | 0 | 0 |
| Giữ ghế | 49 | 8 | 0 | 39 | 2 | 0 | 0 | 0 |
| Hạ tầng | 15 | 0 | 0 | 15 | 0 | 0 | 0 | 0 |
| Hành trình và rủi ro bổ sung | 41 | 27 | 0 | 14 | 0 | 0 | 0 | 0 |
| Hành trình vé offline — INT-06 split | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| Huỷ và hoàn | 8 | 2 | 0 | 4 | 1 | 1 | 0 | 0 |
| Khám phá | 13 | 7 | 0 | 5 | 0 | 1 | 0 | 0 |
| Mở rộng | 29 | 26 | 0 | 0 | 0 | 2 | 1 | 0 |
| Mục tiêu tích hợp | 9 | 0 | 0 | 9 | 0 | 0 | 0 | 0 |
| Ngoại tuyến | 21 | 11 | 0 | 9 | 1 | 0 | 0 | 0 |
| Plan-derived supplementary | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| Quản trị | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 |
| Riêng tư | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 |
| Soát vé | 16 | 6 | 0 | 10 | 0 | 0 | 0 | 0 |
| Sơ đồ và giá | 42 | 4 | 0 | 38 | 0 | 0 | 0 | 0 |
| Sự kiện | 29 | 13 | 0 | 16 | 0 | 0 | 0 | 0 |
| Tài khoản | 32 | 14 | 0 | 16 | 2 | 0 | 0 | 0 |
| Thanh toán | 68 | 11 | 0 | 57 | 0 | 0 | 0 | 0 |
| Thông báo | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| Vận hành | 10 | 3 | 0 | 6 | 0 | 1 | 0 | 0 |
| Vé | 23 | 10 | 0 | 13 | 0 | 0 | 0 | 0 |
| Vé/cửa/offline — INT-05 split | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |

## Đang thiếu hoặc chưa được chứng minh

- Các ca NOT_RUN/BLOCKED vẫn cần được làm hoặc phân loại theo phụ thuộc môi trường. PostgreSQL acceptance S-15/S-16 hiện BLOCKED riêng do Prisma schema engine trong harness; demo profile không bị ảnh hưởng. Những ca staging/provider thật, thiết bị camera/4G, hosted CI và backup off-host không được thay bằng mock/local restore.
- R65/R66 runtime còn phản hồi HTTP 200 web / 401 API root / 405 Mailpit root (reachability only), nhưng official Status từ chối READY vì source đổi sau build và yêu cầu Restart. Free RAM 1,29GiB dưới guard 2GiB (đo lại tại R76). Worker quên mật khẩu mới chỉ bật trong template/.env cô lập; API đang chạy chưa nạp setting, Mailpit reset test còn BLOCKED. R60 đã PASS trên bundle R65. Full regression R70 PASS trước thay đổi launcher R72; sau R72 chỉ chạy focused core unit 13/13, chưa chạy regression lại. Chưa kết luận DEMO_READY.
- Source Ready/Must còn 90 ca chưa PASS; bao gồm coverage workflow/role đầy đủ, concurrency/negative cases và các NFR chưa đo hoặc chưa quyết định.
- Các NEEDS_DECISION giữ nguyên; không tự đặt policy refund, conflict offline, quota, retention hay nội dung pháp lý.
- Chi tiết lịch sử bug, fixture, expected/actual và evidence theo case ở `bugs.md`; inventory/source traceability ở `results.json`; tiến độ R43–R72 ở `progress.json`; trạng thái môi trường ở `run-manifest.json`.

## Giới hạn demo

Browser local và PostgreSQL đã được kiểm trên R65/R66 trước thay đổi R72; hiện profile đang stale-pending-restart (các endpoint cũ vẫn phản hồi), R60 fix đã được xác minh trên bundle R65. Payment/refund/email dùng mock/catcher; password-reset worker chưa được nạp trong tiến trình hiện tại. Không có bằng chứng staging, Internet email/Inbox, provider sandbox thật, 4G/camera thật, nightly/off-host backup hoặc GitHub fresh clone. Các giới hạn này không được tính PASS.
