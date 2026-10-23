# Bàn giao demo Codegym — DEMO_PARTIAL

Run 20261023T132000-demo-handoff, checkpoint R43, 2026-10-23. Branch feature/sprint-4-8-complete, HEAD ce777bd13e472c089eef4a3c1ed4455e501ae3ba; working tree dirty. Không commit/push/merge/deploy. Main local demo READY tại cổng 3000; profile bản sạch đã kiểm riêng rồi stop an toàn.

## Kết quả local

- R40 S-04-AC04: Organizer lưu suất thứ hai cùng thời điểm; UI cảnh báo nhưng vẫn cho lưu như yêu cầu. PostgreSQL xác nhận 2 suất trùng UTC, không có ghế/đơn; fixture đã dọn. Mobile subcase BLOCKED. BUG-R40-01 P3 đã sửa ở R42: quick preset xóa validation cũ; focused test 8/8 và UI local xác nhận, DB fixture được dọn.

- R39: S-04-AC03 xác nhận UI desktop chặn thời gian quá khứ bằng thông báo rõ và DB không ghi suất; mobile BLOCKED do CUA không có điều khiển viewport. S-04-AC05 desktop từ chối Organizer khác, DB không đổi; mobile BLOCKED. Parent case chưa PASS. Fixture đã dọn.

- R38 cross-owner check: Organizer A bị từ chối khi mở fixture DRAFT riêng của Organizer B; PostgreSQL xác nhận owner/status và các quan hệ không đổi. Cleanup exact-scope đã xóa fixture. HTTP 403 được suy ra từ nhánh UI xử lý và guard service; chưa có raw response độc lập. Case S-04-AC05 PASS với giới hạn này.

- Main catalog: 40 sự kiện, 42 suất; desktop/mobile catalog nối trang khi cuộn; sự kiện/ảnh/lịch/giá gốc hiển thị. Main profile giữ 2 đơn PAID/2 vé sau restart.
- Buyer: chọn và giữ ghế D-1 STANDARD 380.000₫, tạo đơn, mock payment, nhận vé QR VALID. PostgreSQL read-only xác nhận một payment SUCCEEDED, đúng tiền, ghế SOLD, hold đã gỡ và một ticket. Mailpit nhận thư D-1 kèm QR trong vài giây; không phải Internet Inbox.
- Exact-file clean package: 1.049 file chuẩn bị, tất cả hash khớp; profile mới cài/migrate/seed/build và hiển thị 40 sự kiện/42 suất/ảnh. Admin, Organizer, Buyer, Staff, Accountant đăng nhập; Buyer hoàn tất mock order A-1 VIP 580.000₫. Restart giữ order/vé PAID/VALID theo browser + DB. Secondary profile đã stop, volume giữ nguyên. Clean-copy không phải fresh Git clone.
- Các luồng coupon/waitlist/transfer/offline/operations/refund có một phần evidence, nhưng chưa nghiệm thu đầy đủ từng AC/hành động/quyền.
- Hướng dẫn local, account giả và cách khởi chạy: DEMO_HANDOFF.md. Secret/credentials không được đưa vào báo cáo.

## Regression cuối trên source gói sạch

`corepack pnpm test` kết thúc mã 0: API 61 test files / 481 tests PASS; web 28 files / 162 tests PASS; deployment/laptop 20/20 PASS, không skip. DB/profile env đã được gỡ nên không chạm DB chính hoặc fixture demo. Log: `r30-full-regression.log`. Regression này không chứng minh các AC còn NOT_RUN hoặc UI browser cho mọi vai trò.

## Ma trận thực thi

488 rows: PASS 139, FAIL 0, NOT_RUN 339, BLOCKED 4, NEEDS_DECISION 5, MISSING 1. Các child assertions giữ nguyên AC gốc; S-04-AC01 đã split thành 2 assertion có evidence riêng.

## Source tier

| Source tier | Total | PASS | FAIL | NOT_RUN | BLOCKED | NEEDS_DECISION | MISSING |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ready | 151 | 37 | 0 | 113 | 0 | 1 | 0 |
| Next | 71 | 28 | 0 | 42 | 1 | 0 | 0 |
| Later | 82 | 36 | 0 | 40 | 1 | 4 | 1 |
| IMPLEMENTED_OR_PROPOSED | 51 | 38 | 0 | 13 | 0 | 0 | 0 |
| GOVERNANCE | 23 | 0 | 0 | 23 | 0 | 0 | 0 |
| TECHNICAL | 110 | 0 | 0 | 108 | 2 | 0 | 0 |

## Product priority

| Product priority | Total | PASS | FAIL | NOT_RUN | BLOCKED | NEEDS_DECISION | MISSING |
|---|---:|---:|---:|---:|---:|---:|---:|
| Must | 176 | 43 | 0 | 131 | 1 | 1 | 0 |
| Should | 87 | 27 | 0 | 57 | 1 | 2 | 0 |
| P1 | 14 | 6 | 0 | 8 | 0 | 0 | 0 |
| Theo quy định gốc | 14 | 0 | 0 | 14 | 0 | 0 | 0 |
| P0 | 37 | 32 | 0 | 5 | 0 | 0 | 0 |
| Could | 42 | 31 | 0 | 8 | 0 | 2 | 1 |
| Theo scope Sprint | 8 | 0 | 0 | 8 | 0 | 0 | 0 |
| Theo story cha | 110 | 0 | 0 | 108 | 2 | 0 | 0 |

## Product group

| Product group | Total | PASS | FAIL | NOT_RUN | BLOCKED | NEEDS_DECISION | MISSING |
|---|---:|---:|---:|---:|---:|---:|---:|
| Đối chiếu tổng thể | 22 | 0 | 0 | 22 | 0 | 0 | 0 |
| Hành trình và rủi ro bổ sung | 41 | 28 | 0 | 13 | 0 | 0 | 0 |
| Điều kiện nghiệm thu | 14 | 0 | 0 | 14 | 0 | 0 | 0 |
| Hạ tầng | 15 | 0 | 0 | 15 | 0 | 0 | 0 |
| Mục tiêu tích hợp | 9 | 0 | 0 | 9 | 0 | 0 | 0 |
| Plan-derived supplementary | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| Tài khoản | 26 | 6 | 0 | 20 | 0 | 0 | 0 |
| Sự kiện | 23 | 4 | 0 | 19 | 0 | 0 | 0 |
| Sơ đồ và giá | 42 | 1 | 0 | 41 | 0 | 0 | 0 |
| Khám phá | 13 | 7 | 0 | 5 | 0 | 1 | 0 |
| Giữ ghế | 49 | 5 | 0 | 42 | 2 | 0 | 0 |
| Đơn hàng | 26 | 5 | 0 | 21 | 0 | 0 | 0 |
| Thanh toán | 68 | 11 | 0 | 57 | 0 | 0 | 0 |
| Vé | 23 | 9 | 0 | 14 | 0 | 0 | 0 |
| Quản trị | 4 | 0 | 0 | 4 | 0 | 0 | 0 |
| Soát vé | 16 | 6 | 0 | 10 | 0 | 0 | 0 |
| Ngoại tuyến | 21 | 11 | 0 | 9 | 1 | 0 | 0 |
| Vận hành | 10 | 3 | 0 | 6 | 0 | 1 | 0 |
| Huỷ và hoàn | 8 | 2 | 0 | 4 | 1 | 1 | 0 |
| Báo cáo và dữ liệu | 8 | 0 | 0 | 8 | 0 | 0 | 0 |
| Riêng tư | 4 | 0 | 0 | 4 | 0 | 0 | 0 |
| Mở rộng | 29 | 26 | 0 | 0 | 0 | 2 | 1 |
| Thông báo | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| Vé/cửa/offline — INT-05 split | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| Core flow browser slice — INT-12 | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| Hành trình vé offline — INT-06 split | 2 | 2 | 0 | 0 | 0 | 0 | 0 |

## Organizer showtime creation (R37)

S-04-AC02 passed: Organizer created a run-bound draft and added a future showtime in the event detail UI. Desktop and 390×844 mobile evidence plus an independent PostgreSQL oracle confirmed ownership/linkage, DRAFT state, local-time to UTC conversion and zero orders/seats. Exact cleanup restored durable data counts. See `s04-ac02-ui-db.json` and `s04-ac02-cleanup.json`.

## Organizer UI smoke (R33)

Tài khoản giả đăng nhập, trang quản lý liệt kê 40 sự kiện/42 suất, 40 đã công bố; chi tiết Bệnh sĩ cho thấy các suất hiện có và coupon panel. Chỉ đọc, không ghi DB. Các AC tạo/sửa/công bố, validation sơ đồ/giá và chặn chủ sở hữu khác vẫn NOT_RUN. Ảnh: `organizer-event-detail-desktop.png`.

## Organizer create-event verification (R34)

S-04-AC01 passed in the local durable demo profile: Organizer created a valid run-bound event, UI and PostgreSQL confirmed owner + DRAFT, and the public catalog exact-title search returned 0. The exact run-owned desktop and mobile drafts were deleted after verifying they had no showtimes/orders/coupons; inventory returned to 40 events/42 showtimes, with 2 orders/2 tickets unchanged. S-04-AC01.01 also passed at 390×844 with no horizontal overflow; screenshots for desktop and mobile are stored in the evidence folder. Child assertions .01/.02 carry separate evidence.

## Scanner negative-case follow-up (R36)

S-30-AC02 now PASS for desktop and 390×844 mobile: the assigned Staff scanner showed the invalid-ticket alert for a synthetic unknown QR; a read-only PostgreSQL oracle found no admission/check-in side effect. Evidence: `s30-ac02-ui-db.json`, `s30-ac02-db-oracle.json`, and screenshots. Valid admission and slow-response UI remain NOT_RUN.

## Còn thiếu và giới hạn

- DEMO_PARTIAL: regression local đã PASS; full action walkthrough mọi vai trò, các negative/concurrency còn thiếu, fresh Git clone/remote checkout chưa làm.
- NEEDS_DECISION: S-08-AC02 và NFR chưa refine S-40/S-48/S-62/S-63; S-60-NFR thiếu ngưỡng nguồn.
- BLOCKED external: thiết bị/4G thật S-33-AC03, sandbox refund thật S-45-NFR, staging concurrency và hosted CI T-31.
- UI kiểm tại R32 xác nhận tìm kiếm và lọc thể loại trên catalog đang hoạt động: “Bệnh sĩ” trả 3 suất; lọc “Kịch Nói” sau khi xoá từ khóa trả 4; khôi phục “Tất cả” trả 42. Tìm kiếm toàn cục và lọc địa điểm ở header cùng các nút điều khoản/chính sách hoàn vé/quy định sơ đồ/hỗ trợ ở footer vẫn disabled; privacy notice đăng ký còn ghi staging/retention, cần review trước luồng người dùng thật. Mock gateway/Mailpit không chứng minh provider thật hoặc Inbox; chưa test camera vật lý, 4G thật hay backup off-host.

## Kết luận

**DEMO_PARTIAL — chưa DEMO_READY.** Main Buyer happy path đã qua UI + DB local; clean exact-file package cũng cài/chạy, đăng nhập đủ vai trò và giữ order/ticket qua restart. Các hạng mục chưa chứng minh tiếp tục để riêng.












## Final exact-file regression (R43)
- Source: current dirty source set, 1,049 selected files; prepared and clean proof trees hash-match source.
- Tests: API 61 files / 481 passed; web 28 files / 163 passed; deploy/laptop 20 passed; zero failures and no skipped tests reported.
- Typecheck: passed. Lint: exit 0 with warnings (2 web unused-variable warnings and API type-aware warnings); no errors. Build: full monorepo passed.
- Active demo: launcher Status READY; read-only PostgreSQL 40 events, 42 showtimes, 2 paid orders, 2 tickets.
- Matrix rows: 494; PASS 142; FAIL 0; NOT_RUN 336; BLOCKED 10; NEEDS_DECISION 5; MISSING 1. Result remains DEMO_PARTIAL.
