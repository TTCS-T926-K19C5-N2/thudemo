# Báo cáo tiến độ sửa lỗi Codegym — chưa hoàn tất

Run: `20261022T230000-remediation` · root `D:\Merge_2\Codegym` · branch `feature/sprint-4-8-complete` · HEAD `ce777bd13e472c089eef4a3c1ed4455e501ae3ba`.

Giữ nguyên dirty tree ban đầu và các thay đổi đã có. Không commit, push, merge, deploy, gửi email thật hoặc gọi payment provider. Profile local dùng PostgreSQL riêng `127.0.0.1:62636/codegym_remediation`, Redis `127.0.0.1:62637/db0`, Mailpit `127.0.0.1:62635` (Mailpit UI `62634`); worker tắt. Fixture S-40 và R19 đã được cleanup có kiểm tra phạm vi. Không truy cập hay sửa DB chính.

## Coverage và regression — checkpoint 2026-10-23

`results.json` khởi tạo từ baseline, giữ nguyên 404 case nguồn và bổ sung 28 subcase để tách mệnh đề có evidence. Tổng 432 dòng (cập nhật sau R19/D13): **PASS 60, FAIL 0, BLOCKED 4, MISSING 1, NEEDS_DECISION 4, NOT_RUN 363**. Riêng 404 case nguồn giữ nguyên baseline; kết quả mới nhất được cập nhật trong checkpoint R19 bên dưới. NOT_RUN chưa phải lỗi; không gộp PASS subcase thành PASS cho AC cha.

| Tier nguồn | PASS | BLOCKED | MISSING | NEEDS_DECISION | NOT_RUN |
|---|---:|---:|---:|---:|---:|
| Ready | 7 | 0 | 0 | 0 | 126 |
| Next | 15 | 1 | 0 | 0 | 46 |
| Later | 36 | 1 | 1 | 4 | 40 |
| TECHNICAL | 0 | 2 | 0 | 0 | 108 |
| GOVERNANCE | 0 | 0 | 0 | 0 | 23 |
| IMPLEMENTED_OR_PROPOSED | 0 | 0 | 0 | 0 | 22 |

Ưu tiên nguồn theo kết quả hiện tại: Must 17 PASS / 1 BLOCKED / 143 NOT_RUN; Should 10 PASS / 1 BLOCKED / 2 NEEDS_DECISION / 62 NOT_RUN; Could 31 PASS / 0 BLOCKED / 1 MISSING / 2 NEEDS_DECISION / 8 NOT_RUN. Nhóm source, từng case và ánh xạ requirement nằm trong `results.json`; baseline nguyên bản không bị sửa.

Regression hiện tại trên source đang làm:

- API unit trên source hiện tại: 60 file / 471 test PASS (rerun 2026-10-23).
- Web unit trên source hiện tại: 27 file / 157 test PASS, gồm ba test component coupon mới.
- API E2E đầy đủ gần nhất trên PostgreSQL/Redis/Mailpit profile cô lập: 22 file / 133 test PASS; waitlist E2E sau D16 10/10 PASS. Profile hạ tầng cô lập hiện vẫn chạy, API/Web đã dừng.
- API và Web typecheck/build PASS; API lint exit 0 (23 warnings), Web lint exit 0 (2 warnings), không có lint error.
- Root `pnpm test` gần nhất: API 60/471, Web 27/157 và deploy suite 20/20 PASS (`r22-root-test-after-qr-optimization.log`); API unit/typecheck/build/lint và full API E2E đã chạy lại sau thay đổi D16. API typecheck/build/lint và Web typecheck/build/lint đều exit 0; cảnh báo lint được giữ nguyên trong log.
- Đây chưa phải sweep đủ 404 AC/NFR và không chứng minh staging, provider thật, thiết bị/camera/4G, hosted CI hay off-host backup. Tại checkpoint ban đầu Docker từng unavailable; profile riêng sau đó được khởi chạy lại an toàn. R19 kiểm thử dùng profile đó; hiện chỉ infra cô lập còn chạy, không dùng DB khác.
## S-40 waiting room

API/Redis E2E dùng capacity 1 và lease 10 giây chỉ trong cấu hình thử: FIFO positions 1/2, direct hold/order bypass bị chặn, lease hết hạn thì buyer kế tiếp được promote và buyer cũ bị thu hồi.

Browser authenticated trên app build hiện tại: trạng thái tải delay hiển thị; desktop được admit và thấy thời hạn; mobile 390px thấy vị trí FIFO 1, không tràn ngang; HTTP 503 hiển thị error alert; không có page error. Fixture run-bound đã cleanup. S-40-AC01 và hai subcase evidence PASS cho local slice. NFR NEEDS_DECISION vì ngưỡng production, lease và vị trí queue chưa chốt; test values đã reset về default.

Ban đầu component không hiển thị trạng thái khi request admission đang chờ. Đã sửa `WaitingRoomNotice` để hiện status message và thêm unit tests; full web regression/build/lint/typecheck đều chạy lại đạt.

## Lý do danh sách sự kiện trống trong app local

Browser vào `127.0.0.1:3410`, web/API PID khớp PID do run remediation quản lý. `GET 127.0.0.1:3411/showtimes` trả HTTP 200, `items=[]`, `totalCount=0`; API dùng profile `codegym_remediation`, không phải DB chính. Trang local đang hiển thị catalog của DB thử nghiệm chưa có suất diễn. Đây không phải bằng chứng danh sách DB chính bị xóa; DB chính không được truy vấn hoặc sửa. Evidence: `catalog-empty-profile.json`.

## Các bằng chứng remediation trước đó

- S-45: local mock whole-order cancellation/refund, owner/check-in/cutoff guards, release seats/tickets, desktop/mobile browser; provider sandbox/NFR còn BLOCKED.
- S-48: ba mock refund failures, increasing scheduled backoff, accountant visibility và explicit mock resolution; không coi DB time advance là thời gian chờ thật.
- S-60 PDF: owner download, non-owner 403, một trang vector cho 2.002 ghế và browser states đã xác minh; NFR còn MISSING/unrefined.
- S-62 CSV: browser download với fixture tổng hợp, oracle và trường tối thiểu không PII; NFR NEEDS_DECISION.
- T-31: 10 vòng × 200 HTTP request đồng thời trên PostgreSQL tranh 100 ghế; mỗi vòng 100×200 và 100×409, không 429/lỗi khác. N=2.000, p95 302.0233 ms, max 434.8324 ms, loopback local. Staging/hosted CI còn BLOCKED.
- S-31-AC02 được chạy lại trên PostgreSQL cô lập: hai HTTP check-in đồng thời cho cùng vé trả một 200/một 409 và DB giữ một check-in. S-33-AC01/S-34-AC01/S-34-NFR PASS ở lát cắt local: Chromium desktop tải full snapshot, IndexedDB giữ time/key/ticket state; scan QR offline được lưu durable trước xanh; cùng request ID còn trong queue sau đóng/mở persistent browser profile offline ở 390px. S-36-AC01 được chạy lại với hai cửa/thiết bị và offset khác nhau: upload scan muộn trước, scan sớm sau; admission giữ thời điểm sớm và scan muộn thành conflict. Scanner/offline focused web unit 49/49 PASS nhưng là logic/unit với mock. Browser sync sau lost ACK/partial batch, snapshot delta/5k, role revoke và camera/4G thiết bị thật chưa được chứng minh.

## Còn mở

R00–R23 chưa xong. 363 dòng hiện NOT_RUN; 4 BLOCKED, 4 NEEDS_DECISION và 1 MISSING (trong đó S-60-NFR) vì nguồn chỉ ghi “chưa refine”. Chưa hoàn tất full 404 traceability, S-40 NFR policy, coupon S-56 (D01 approved; local implementation/tests run, remaining buyer browser/API/PostgreSQL integration, HTTP auth/negative cases and provider/refund allocation policy open), waitlist S-59 (D02/D14/D15/D16 approved; FIFO, unsubscribe/erasure, cancel/refund signals and final sold-seat recheck passed locally; external SMTP acceptance is not atomic with PostgreSQL), analytics S-63 AC local đã đạt (NFR còn NEEDS_DECISION), refund UNKNOWN/batch cancellation/reconciliation/privacy/retention/backup, offline lost-ACK/partial-batch continuation, snapshot delta/5k, role revoke/account switching, hosted CI/staging/provider thật, camera/4G/device, off-host backup/key recovery và DEC-18 enforcement readback. Không dùng local mock/restore làm bằng chứng cho các gate đó.

**Kết luận:** một số lát cắt local đã được sửa và kiểm chứng đầy đủ trong phạm vi nêu trên; toàn dự án chưa nghiệm thu và chưa thể ghi hoàn tất.

Sau khi thêm assertion giữ chỗ/đặt hàng bị từ chối cho buyer có lease hết hạn (HTTP 429 `WAITING_ROOM_REQUIRED`), filtered S-40 E2E đạt 1/1 và full API E2E rerun đạt 20 file/110 test sau các race regression mới. API lint rerun exit 0 với warnings hiện hữu. Latest logs: `e2e-after-s40-final.log`, `s40-expired-lease-guard-e2e-wrapper.log`, `api-lint-after-s40-final.log`, `r19-full-api-e2e.log`.

## Checkpoint 2026-10-23 — D01/D02/D04 và S-63 đã kiểm local

Người dùng đã chốt D01 (một mã/đơn, floor %, giảm tối đa bằng subtotal, đơn 0₫ xác nhận không gateway), D02 (FIFO thông báo, không giữ ghế), D04 (cohort A, hold→order và hold→paid). S-63-AC01 PASS sau fixture DB, oracle độc lập và browser desktop/mobile; S-63-NFR NEEDS_DECISION do N65 chưa refine workload/threshold. R16/R17 VERIFIED cho lát cắt local.

R18 có hai race transaction mới và full API E2E hiện 20 file/110 test PASS. S-56/S-59 chưa triển khai: D01/D02 đã duyệt nhưng R18 và các policy liên quan còn mở; D06/D12 được hỏi, chưa có trả lời. Không sửa DB chính, không gửi email/payment thật, không commit.

## S-63 và R18 checkpoint mới

S-63-AC01 PASS trên profile local. Fixture 10 cohort session + một sentinel đúng to boundary/5 order/3 paid/5 expired/1 pending, gồm một lượt hai ghế và session đúng from boundary; API/web hiển thị đúng, oracle độc lập từ raw PostgreSQL khớp count/mean/p90. Browser owner đã chạy desktop 1440×1000 và mobile 390×844; loading/empty/error/success đều thấy, không tràn ngang và không có page error. S-63-NFR NEEDS_DECISION vì N65 chưa refine workload/threshold.

R18 vừa thêm hai race thật trên PostgreSQL: expiry service vs signed mock webhook cho order hết hạn (5 vòng) và cancellation/refund vs duplicate success webhook theo policy S-45 đã duyệt. Full API E2E đạt 20 file/110 test. R18 vẫn còn các ca khác và gate staging.

Cleanup S-63 xóa mutable fixture rows theo showtime/session/order. Audit rows được giữ bởi append-only trigger; năm lượt seed/cleanup S-63 để lại tổng 262 synthetic audit snapshots trong DB remediation (54 trong fixture cuối). Cleanup evidence cuối xác nhận 54 dòng. Chúng chứa UUID/trạng thái fixture, không có email/mật khẩu mới; DB vẫn cô lập.













## Checkpoint 2026-10-23 — R19 scanner concurrency

Filtered `ticket-check-in.e2e-spec.ts` rerun on the isolated PostgreSQL profile passed 4/4. S-31-AC02 is PASS; related scanner/offline UI unit suite is 49/49, but remaining INT-05/06/07/10/16 and S-34-NFR/S-35-AC02/S-36-AC01 stay NOT_RUN until browser persistence and database offline sync tests run. Existing scanner demo scripts were inspected and not executed because they read repository `.env` and mutate a fixed sample showtime. R19 remains IN_PROGRESS. BUG-R19-01 (query-selected showtime lost on offline shell relaunch) was reproduced, fixed and browser-verified: fresh Chromium reopened offline with showtime/gate/input restored and queue ID intact. full Web unit 26/154, build/typecheck/lint pass. Camera and real 4G remain BLOCKED. Evidence: `bugs.md`, `bug-retest.md`, `r19-browser.json`, `r19-pre-fix-repro.json`, `r19-offline-reopened-mobile.png`, `r19-web-full-unit.log`, `r19-web-build.log`.

Full API E2E sau R19 offline ledger regressions: 20 files / 112 tests PASS; API typecheck PASS. Run manifest source inventory refreshed to 1004 current files, SHA-256 `590b74fed283b7dfcda137efb4d26c3d92f5d3536a302e75a0c9747b6ca469c5`; prior fingerprint retained as initial snapshot.

R19 browser evidence: `r19-browser.json`; desktop/mobile screenshots include snapshot and offline queue before/after browser relaunch. Fixture DB rows and temporary persistent browser profile were cleaned using run-bound ownership checks.


### BUG-R19-01 — đã sửa và xác minh local

Khi mở từ `?showtimeId=`, app không lưu lựa chọn vào localStorage. Offline Service Worker chỉ phục vụ shell `/scanner`, bỏ query string, khiến app không phục hồi gate/input dù queue còn nguyên. Đã lưu suất hợp lệ từ phản hồi `/check-in/today`. Repro trước sửa ở `r19-offline-reopened-before-fix.png`; sau sửa, Chromium mở lại offline khôi phục showtime/gate, input enabled và cùng queue ID (`r19-browser.json`, `r19-offline-reopened-mobile.png`).


### R19 bổ sung — đồng bộ tự động khi có mạng lại (2026-10-23)

Checkpoint ban đầu: Chromium giữ requestId qua relaunch offline, đồng bộ một lượt và PostgreSQL xác nhận một scan ACCEPTED cùng một admission NORMAL. Kết quả này sau đó được thay bằng batch 40 lượt và partial-ACK run ở dưới; đoạn này chỉ ghi lịch sử đợt đầu.


### R19 — kiểm hàng đợi 40 lượt (2026-10-23)

S-35-AC01 PASS trên profile local cô lập. Browser Chromium đã quét 40 vé trả tiền khác nhau khi offline; IndexedDB giữ đủ 40 request ID trước khi UI báo thành công. Đóng/mở lại browser ở 390×844 vẫn giữ đủ hàng đợi. Khi nối mạng, không bấm nút đồng bộ, app gửi đúng một POST batch 40, nhận 40 ACK `synced`, rồi queue mới về 0. Oracle PostgreSQL xác nhận 40 offlineScanLog ACCEPTED, 40 admission NORMAL đúng cửa và 40 order item đã check-in. Fixture đã được cleanup. Bằng chứng: `r19-browser.json`, `r19-fixture-verify.log`, ảnh desktop/mobile.

S-35-AC02 và S-35-NFR PASS cho partial-ACK fault injection qua browser route: server thật commit đủ 40, browser chỉ nhận 20 ACK, queue giữ 20; app gửi đúng 20 ID ban đầu ở request tiếp, nhận ACK và xóa queue. Oracle PostgreSQL xác nhận 40 scan ACCEPTED và 40 admission NORMAL duy nhất. Đây chưa phải lỗi mạng trên thiết bị vật lý.


### R19 — partial ACK và tiếp tục queue (2026-10-23)

S-35-AC02 và S-35-NFR PASS cho phần local. Endpoint thật đã commit 40 lượt trên PostgreSQL; browser-route fault injection chỉ chuyển 20 ACK cho UI. App bỏ đúng 20 hàng đã ACK, giữ 20 hàng còn lại, gửi lại đúng các request ID gốc trong POST 20 và nhận đủ ACK trước khi queue về 0. SQL độc lập xác nhận chính xác 40 offline scan ACCEPTED và 40 admission NORMAL duy nhất; không nhân admission khi gửi lại request đã commit. Đây là fault injection ở lớp response browser, không phải kiểm chứng mất mạng/vật lý trên thiết bị. Evidence: `r19-browser.json`, `r19-fixture-verify.log`, `r19-offline-sync-e2e.log`.

Evidence separation note: `r19-browser.json` is the unmodified full-batch run (one POST of 40, 40 ACKs). `r19-browser-partial-ack.json` is the separate partial-ACK fault-injection run (POST 40, browser receives 20, then POST 20 with original IDs). The PostgreSQL verifier passed on each run; fixture cleanup was run after each.

Partial-ACK UI evidence includes `r19-partial-ack-pending-mobile.png`: after the first response delivered 20 of 40 ACKs, mobile UI still displayed 20 queued scans before the retry. The unmodified full-batch run remains in `r19-browser.json`; the fault-injected run is `r19-browser-partial-ack.json`.


### R19 — vé đã vào bị từ chối tại cửa khác

S-31-AC01 PASS trên Chromium desktop và mobile. Quét vé hợp lệ tại Gate A trả HTTP 200; quét lại cùng vé ở Gate B trả HTTP 409. UI cả hai viewport hiển thị thời điểm và Gate A đã vào. Oracle PostgreSQL xác nhận một NORMAL admission duy nhất cho mỗi vé và `checkedInAt` đã lưu. Fixture có hai cửa theo run-id và đã cleanup. Evidence: `r19-duplicate-browser.json`, `r19-fixture-verify-duplicate.log`, `r19-duplicate-at-second-gate-desktop.png`, `r19-duplicate-at-second-gate-mobile.png`.


### R19 — admission ngoại lệ có kiểm soát

S-31-AC03 PASS trên desktop/mobile. Sau lần vào NORMAL ở Gate A, Gate B được cấp riêng quyền override. UI chặn submit khi chưa có lý do và chưa xác nhận chủ vé; sau khi nhập lý do, tích xác nhận, API trả 200. PostgreSQL xác nhận thêm admission EXCEPTION đúng Gate B với reason, ownerConfirmed=true và staffName; admission NORMAL ban đầu vẫn giữ nguyên. Verifier kiểm hai vé trên hai viewport, fixture đã cleanup. Đây là kiểm thử contract local đã được duyệt, không phải đánh giá pháp lý. Evidence: `r19-duplicate-browser.json`, `r19-fixture-verify-duplicate.log`, `r19-override-success-desktop.png`, `r19-override-success-mobile.png`.


### R19 — stale snapshot delta

S-33-AC02 PASS trên browser local cô lập. Sau full snapshot 40 vé, một lượt check-in thật qua API đổi trạng thái vé ở PostgreSQL. Harness chỉ đưa `lastSyncAt` của IndexedDB lùi 31 phút, rồi phát sự kiện online. UI tự gọi endpoint với saved cursor; API trả delta 200 gồm đúng vé đổi sang `checked_in`; IndexedDB merge thay đổi, giữ tổng 40 vé và cập nhật cursor/lastSyncAt. Oracle xác nhận một admission NORMAL và `checkedInAt`; desktop/mobile không lỗi/tràn ngang. Fixture đã cleanup. Đây chứng minh luồng delta local, không chứng minh 4G thật. Evidence: `r19-delta-browser.json`, `r19-fixture-verify-delta.log`, ảnh desktop/mobile.


## Checkpoint — quyết định dữ liệu snapshot ngoại tuyến

Người dùng chốt chỉ lưu mã vé và trạng thái. Áp dụng trong [scanner-db.ts](/D:/Merge_2/Codegym/apps/web/src/features/scanner/scanner-db.ts): IndexedDB v4 migration loại checkedInAt, seatLabel, ticketType và các trường mô tả khác; đồng thời giữ scope showtimeId làm partition/key để không trộn suất. Offline UI không còn bịa thời điểm check-in hay hiển thị ghế/hạng vé lấy từ cache. Decision D13 chỉ xử lý shape snapshot, không đóng D09.

Kiểm chứng source: web typecheck PASS; focused scanner tests 17/17 PASS; web build PASS; web lint PASS. Browser migration kiểm tra DB v3 có trường thừa và durable scan đang chờ đã BLOCKED: Chromium local UI báo trang không tải được trước khi module mở database. Evidence ghi tại r19-idb-migration.json/png; không tính là PASS. Fixture R19 đã seed để tạo môi trường thử và cleanup bằng run-bound script. S-33-AC01 và S-33-NFR chuyển BLOCKED vì bằng chứng PASS trước đó không phù hợp quyết định mới; S-33-AC03 cũng sẽ cần retest 4G/device thật.


## Checkpoint — offline snapshot sau quyết định D13

Kết quả hiện tại sau tách 2 mệnh đề S-33-NFR: 408 dòng, PASS 22, BLOCKED 8, NEEDS_DECISION 4, MISSING 1, NOT_RUN 373, FAIL 0. S-33-AC01/NFR bị chuyển BLOCKED vì PASS trước đó lưu/đọc trường không còn được phép; S-33-AC03 BLOCKED vì số đo 5.000 vé là localhost N=1, không phải mạng 4G. Không tính các mệnh đề này PASS cho đến khi chạy được migration/UI và test đúng thiết bị/mạng.

R19 fixture đã cleanup sau browser attempt. Focused unit 17/17, typecheck/build/lint PASS. IndexedDB migration harness đã tạo DB v3 có descriptive fields và durable scan chờ, nhưng route Chromium vào trang quét không tải được nên DB vẫn v3; đây là BLOCKED của lần kiểm thử harness/runtime, chưa xác định là bug sản phẩm. Mọi cổng ngoài local và phần R00–R23 khác giữ nguyên trạng thái trước đó.


Full Web unit rerun after D13: 26 files / 154 tests PASS (`web-unit-after-offline-privacy-full.log`). This does not remove the browser migration BLOCKED status.

## R12 checkpoint — 2026-10-23

Coupon implementation and local S-56 AC acceptance are complete. The current source has buyer/organizer desktop/mobile browser evidence, expiry/role/ownership checks, concurrent PostgreSQL cap test, zero-payable fulfillment, and coupon-aware full-order refund financial reconciliation. Provider sandbox and partial-refund transaction are not claimed; remaining R18 dependencies stay open. See 12-coupon-browser-ui.json and logs listed in R12 progress.

Follow-up R12 check: the PostgreSQL E2E also applied two successive codes to one order and confirmed replacement rather than stacking (one redemption row; removal restored full subtotal). The zero-payable path now verifies a live, unexpired seat hold belongs to the order before sale. API build after these source changes passed.


## R10/R12 tiếp tục — 2026-10-23

API coupon management unit 5/5 PASS với mocked Prisma cho owner update/deactivate, invalid date/percent/quota; full API unit đạt 59/465. Không thay thế HTTP/PostgreSQL/browser proof.

Route source inventory: 113 API decorator declarations and 29 Next page/handler entries (28 pages, 1 route handler), recorded in `route-source-inventory.json`. This is static source evidence only; module mount/runtime HTTP authorization remains unproven.

- Tạo `execution-queue.json` cho 382 case chưa đóng trong 404 case nguồn; mỗi dòng giữ source cell, expected, fixture prerequisite, surfaces, steps, execution strategy và trạng thái. Sắp theo priority rồi tier; Later vẫn được kiểm kê nhưng không tự nâng thành release gate. `results.json` không bị đổi status vì việc lập queue.
- Thêm test component buyer ở `apps/web/src/features/order-review/order-review.coupon.spec.tsx`; focused run 3/3 PASS cho apply/remove và refresh giá trị server, API validation alert, khóa sửa coupon khi payment INITIATED. API được mock nên đây chưa phải browser/API/PostgreSQL evidence; S-56-AC01 vẫn MISSING.
- Docker profile chưa chạy tại thời điểm này; không thực hiện kiểm thử cần DB live hoặc fallback sang DB khác.
## R13 checkpoint — S-59 waitlist (2026-10-23)

Quyết định D02/D14/D15 đã được ghi vào decision register: thông báo FIFO, mỗi N ghế chỉ thông báo N người đầu; ghế không được giữ riêng; SMTP thử tối đa 3 lần theo mail core (5s/15s).

- Đã thêm schema/migration bền vững, route BUYER xem/đăng ký/hủy, panel ở trang chọn ghế khi đã bán hết, signal trong luồng dọn hold hết hạn và hết hạn order, và worker chỉ bật bằng WAITLIST_MAIL_WORKER=true.
- API typecheck/build PASS; Web typecheck/build PASS; web seat-selection tests 3/3 PASS; API lint chạy xong với warnings hiện hữu ngoài vùng waitlist; isolated PostgreSQL/Mailpit E2E 6/6 PASS. Có kiểm đồng thời hai signal worker, hai delivery worker, race hai yêu cầu join một tài khoản, trigger từ hold hết hạn/order expiry, và retry đúng ba lần khi cố ý làm `MailService.send` reject; đây là lỗi được inject tại service, không phải outage SMTP thực. Mailpit nhận thư trên nhánh gửi thành công; điều này chỉ chứng minh catcher acceptance, không chứng minh Inbox/provider thật.
- Browser mobile-sized 535×756 đã đăng nhập bằng buyer tổng hợp, thấy CTA, text không giữ ghế, vị trí 1 và nút hủy; DB oracle xác nhận waitlist entry tồn tại, 0 hold, 0 ghế chưa bán. Ảnh được xem trực tiếp qua CUA nhưng chưa xuất thành PNG trong run folder; desktop viewport chưa kiểm tra.
- Còn NOT_RUN: release do refund/cancel, showtime cancellation suppression, opt-out/erasure, mua ghế trước lúc gửi, email retry qua SMTP outage thật; staging/provider/off-host/device/NFR tải không thuộc bằng chứng local này. Composite S-59-AC01 giữ BLOCKED; không nâng acceptance tổng thể. S-59-NFR policy hiện PASS theo D02 và local DB proof.
- Fixture browser run-bound đã được dọn; log cũ được profile manager đổi tên trước khi ghi log E2E mới.













## S-11 tiếp tục — thao tác bỏ từng ghế (2026-10-23)

Đã triển khai `DELETE /showtimes/:id/holds/:seatId` trong controller BUYER hiện mount và thêm nút **Bỏ ghế** ở ghế người dùng đang giữ. API khóa hàng `hold_sessions` như luồng tạo đơn để tuần tự hóa hai thao tác; câu DELETE tự kiểm user/session/token/expiry, bỏ seat khỏi `expectedSeatIds` nhưng giữ nguyên expiry của các ghế còn lại, đồng thời phát tín hiệu waitlist trong cùng transaction. Không dùng controller legacy public/mock identity.

API/Web typecheck, build, lint (warnings hiện hữu), và unit: API 59 files/467 tests PASS; Web 27 files/157 tests PASS; holds focused 40 tests PASS. Cập nhật S-11 final acceptance ở phần cuối báo cáo sau khi profile PostgreSQL được khôi phục và UI/DB được kiểm chứng.

S-11 final source adjustment: explicitly treat a successful release of the last held seat as intentional (clears timer without showing the expiry state). Typecheck and web unit suite rerun after this adjustment; 157/157 PASS.


**Đếm mới của results.json tại checkpoint S-11:** 427 dòng (AC 180, EPIC 11, EPIC_NFR 11, GOVERNANCE 14, INTEGRATION 22, NFR 70, PRODUCT_GOAL 1, SPRINT_GOAL 8, TASK_AC 55, TASK_NFR 55); theo mọi tier: PASS 45 / BLOCKED 10 / MISSING 2 / NEEDS_DECISION 4 / NOT_RUN 366 / FAIL 0. Danh sách tier đầy đủ gồm Ready 133, Next 62, Later 77, TECHNICAL 110, GOVERNANCE 23, IMPLEMENTED_OR_PROPOSED 22.




## S-11 final acceptance — 2026-10-23

S-11 AC01/02/03 and NFR now PASS: 4 isolated PostgreSQL E2E tests pass (including 30 release timing samples). Browser buyer flow ran on mobile 535×756 and desktop 1280×800. Independent DB oracle after releasing one of three seats: 1 available, 2 held, 2 expected, identical expiry for remaining seats; final release returned 3 available, 0 held, expected=0. Latency: p95 15.746ms, max 16.971ms, 0 errors; workload is local loopback and does not establish staging/device performance.

A responsive-layout defect was found during the first screenshot and fixed. `bugs.md` records severity, steps, before/after evidence. Final screenshots are s11-mobile-release-fixed.jpg and s11-desktop-release-fixed.jpg; pre-fix mobile image is preserved as s11-mobile-release.jpg.




S-11 browser fixture cleanup oracle PASS: removed its event, showtime, two synthetic users, and all holds; remaining counts are all zero (`s11-browser-fixture-cleanup.json`). The browser tab and profile-owned API/Web processes were closed. The isolated Compose services remain healthy with workers disabled and Mailpit as the only SMTP destination; the PostgreSQL volume is preserved for the remaining remediation work.

## Regression toàn workspace và API E2E hiện tại — 2026-10-23

Root `pnpm test` sau các thay đổi: API 59 files/467 tests PASS, Web 27 files/157 tests PASS, deploy 20/20 PASS. Root lint exit 0; API/Web có cảnh báo đã ghi log, không có lint error. API/Web typecheck và build PASS. Full API E2E được chạy lại trên profile cô lập hiện tại: 22 files/126 tests PASS (`e2e.log`). Runner dùng profile PostgreSQL/Redis riêng, SMTP catcher, worker tắt và payment endpoint giả lập bị chuyển tới loopback. Những dòng kết quả chỉ được nâng khi có map trực tiếp sang requirement; các yêu cầu UI vẫn cần browser evidence, staging/provider và device/4G không được suy ra từ E2E local.

## R19/D13 checkpoint — 2026-10-23 (kết quả mới nhất, thay thế đoạn migration BLOCKED trước đó)

Đã chạy lại trên profile riêng `codegym_remediation`, API/Web build hiện tại và Chromium. Migration fixture bắt đầu ở IndexedDB v3 với ticket chứa metadata legacy và một durable scan pending; sau khi app mở scanner, DB lên v4, ticket chỉ còn `showtimeId` (partition), `code`, `status`; pending scan và metadata suất được bảo toàn. Kết quả: `r19-idb-migration.json` PASS. Luồng browser authenticated tải đủ 40 vé; kiểm tra IndexedDB xác nhận đúng field set tối thiểu, scan offline lưu bền, queue/request IDs còn nguyên sau khi đóng/mở browser mobile 390px, reconnect gửi batch 40 và chỉ xóa sau ACK thật. Không có page error hoặc API 5xx. PostgreSQL verifier xác nhận 40 scan ACCEPTED và 40 admission NORMAL; fixture được cleanup theo run-id. API/Web của lượt này đã dừng; Compose cô lập được giữ healthy, worker tắt.

S-33-AC01, S-33-NFR và S-35-AC02 hiện PASS cho các lát cắt local đã chạy. S-35 partial-ACK evidence vẫn là fault injection ở response browser; không chứng minh sự cố transport hoặc thiết bị vật lý. Chưa chứng minh camera/4G, staging/provider, 5.000 vé ở tải đại diện, hay toàn bộ ma trận offline. R19 và remediation tổng thể vẫn IN_PROGRESS.

Coverage mới nhất của `results.json` (427 dòng, gồm subcase): **PASS 47, FAIL 0, BLOCKED 8, MISSING 2, NEEDS_DECISION 4, NOT_RUN 366**. Theo tier: Ready 7 PASS/126 NOT_RUN; Next 13 PASS/3 BLOCKED/46 NOT_RUN; Later 35 PASS/1 BLOCKED/1 MISSING/5 NEEDS_DECISION/40 NOT_RUN; TECHNICAL 2 BLOCKED/108 NOT_RUN; GOVERNANCE 23 NOT_RUN; IMPLEMENTED_OR_PROPOSED 22 NOT_RUN. Theo nhóm ưu tiên: Must 15 PASS/3 BLOCKED/143 NOT_RUN; Should 10 PASS/1 BLOCKED/2 NEEDS_DECISION/62 NOT_RUN; Could 22 PASS/2 BLOCKED/2 MISSING/2 NEEDS_DECISION/9 NOT_RUN. Không tự đặt các case NOT_RUN làm gate và không dùng localhost để tuyên bố staging/device.

Checkpoint chi tiết và hash harness: `r19-d13-checkpoint.json`. Ảnh hiện tại: `r19-idb-migration.png`, `r19-snapshot-desktop.png`, `r19-offline-queued-desktop.png`, `r19-offline-reopened-mobile.png`. Log cleanup/DB: `r19-fixture-verify.log`, `r19-fixture-cleanup.log`.

### Mở rộng snapshot local 5.000 vé — 2026-10-23

Authenticated Chromium nhận đủ 5.000 vé qua HTTP 200 trong một mẫu chạy (N=1), JSON 978.839 byte, latency đo từ thao tác tải đến UI xác nhận là 857,339 ms, 0 lỗi. IndexedDB giữ 5.000 bản ghi chỉ có `showtimeId`, `code`, `status`; desktop và viewport 390px không tràn ngang. Fixture verify/cleanup PASS. Đây là loopback local N=1; không dùng làm bằng chứng 4G, thiết bị thật hay percentile NFR. Raw data và screenshots: `r19-5000-browser.json`, `r19-5000-desktop.png`, `r19-5000-mobile.png`.

## S-56 buyer workflow và BUG-S56-01 — checkpoint 2026-10-23

Authenticated Chromium đã chạy trang `/orders/<run-owned-order>` trên desktop 1440×1000 và mobile 390×844, qua API hiện tại và PostgreSQL cô lập. Mã sai trả HTTP 400 và UI báo lỗi; `S56FLOOR10` trả 200, UI hiển thị tạm tính 101, giảm 10, payable 91; bỏ mã trả 200 và UI trở về 101/0/101. Screenshot applied/removed được giữ lại. DB oracle độc lập xác nhận subtotal 101, discount 0, total 101, redemption RELEASED, không có payment. Fixture được cleanup.

Repro phát hiện BUG-S56-01: `OrderHistoryService.current` không trả `subtotalAmount`, `discountAmount`, `couponCode`, nên order-review mất trạng thái mã và suy ra breakdown sai sau khi API apply thành công. Đã thêm projection/response và regression spec. Retest pass; API typecheck/build/lint pass, API unit 60 file/468 test PASS, isolated coupon E2E 4/4 PASS. Xem `bugs.md`, `bug-retest.md`, `r12-buyer-checkpoint.json`.

S-56-AC01.07/.08 hiện PASS với browser/API/DB và ownership/validation evidence. S-56-AC01 hiện PASS cho yêu cầu nguồn và các lát cắt R12 đã kiểm trên local. D12 đã chốt và áp dụng cho phân bổ giảm giá từng vé; hệ thống hiện không có API hoàn một phần nên không tuyên bố đã chạy partial-refund transaction. Provider sandbox chưa chạy.


### Cập nhật D12 và S-56 — 2026-10-23

D12 đã được người dùng chốt: khi hoàn một phần, phân bổ coupon giảm theo tỷ trọng giá từng vé. Browser/API/DB retest hiện có cũng xác nhận coupon sai, chưa đến hạn và hết hạn đều bị từ chối; organizer tạo/vô hiệu coupon trên desktop/mobile; chủ sở hữu được quản lý, organizer khác và BUYER bị từ chối. Vì vậy các ghi chú cũ nói còn thiếu UI desktop/mobile hoặc expiry là lỗi thời; kết quả chi tiết mới nằm trong `s56-buyer-browser.json`. S-56-AC01 vẫn MISSING do chưa chứng minh luồng hoàn một phần/phân bổ hạch toán. Phần lẻ VND và cách xử lý số dư chưa được quyết định; không tự đặt quy tắc. Hủy đơn hiện tại chỉ hỗ trợ hoàn toàn đơn.


### D12 — phân bổ giảm giá/đối soát hoàn — 2026-10-23

Người dùng đã chốt D12: phân bổ theo tỷ trọng giá từng vé; lấy floor cho phần VND nguyên rồi chia số dư từng đồng theo thứ tự mã vé tăng dần. Đã áp dụng phép phân bổ số nguyên an toàn vào báo cáo tài chính và kiểm với PostgreSQL cô lập: đơn 250.000₫, discount 1₫, refund 249.999₫ cho kết quả net 0₫. `reports.service.spec.ts` 6/6 và `lifecycle-cancellation.e2e-spec.ts` 6/6 đạt. API unit 60 file/471 test, typecheck/build đạt. Hệ thống hiện chỉ hỗ trợ hủy/hoàn toàn đơn; chưa có chọn vé hoặc API hoàn một phần, nên phần đó còn MISSING theo scope R12/R18. Không có provider sandbox trong kiểm tra này.


Retest sau khi ổn định thứ tự mã vé: API unit 60 file/471 test PASS; full isolated API E2E 22 file/127 test PASS; build, typecheck, lint exit 0 (cảnh báo lint hiện hữu được giữ nguyên). Lượt E2E full được lưu riêng tại `r12-full-api-e2e-after-d12.log`; log 6/6 targeted hiện vẫn nằm ở `e2e.log`.

## Cập nhật mới nhất — D16 và race thông báo waitlist (2026-10-23)

Người dùng đã chốt D16: kiểm tra lại tồn ghế ngay trước khi gọi SMTP; nếu hết ghế thì hủy email. Đã thêm lần kiểm tra PostgreSQL cuối trong `WaitlistService` sau bước claim/validation ban đầu và ngay trước `MailService.send()`. E2E dùng PostgreSQL thật của profile cô lập để tạo đúng race: ban đầu còn ghế, worker đã qua kiểm tra đầu, fixture ghi nhận mua hết ghế trước kiểm tra cuối. Kết quả: notification `CANCELLED/SEATS_SOLD_BEFORE_NOTICE`, subscriber trở về `ACTIVE`, không gọi SMTP. Waitlist E2E 10/10; API full E2E 22 file/133 test; API unit 60 file/471 test; typecheck/build/lint exit 0. Lint ghi 23 warning hiện hữu trong repository.

Ma trận hiện có 432 dòng: **PASS 60, FAIL 0, BLOCKED 4, MISSING 1, NEEDS_DECISION 4, NOT_RUN 363**. `R13-PLAN-06.05` và bug `BUG-R13-02` đã được cập nhật cùng D16 trong `decision-register.json`, `results.json`, `progress.json` và `bugs.md`. Regression này chỉ chứng minh chính sách recheck ở profile local PostgreSQL/Mailpit. PostgreSQL không thể giao dịch nguyên tử với SMTP từ xa: nếu một giao dịch mua hoàn tất sau lần đọc cuối nhưng trước khi SMTP chấp nhận thư thì vẫn có khe đua; không tuyên bố đảm bảo Inbox/thứ tự nhận thư.

R00–R23 và toàn bộ 404 AC/NFR **chưa hoàn tất**. 363 dòng còn NOT_RUN, có 4 case BLOCKED, 1 MISSING và 4 NEEDS_DECISION; staging, thiết bị/camera/4G, provider thật, hosted CI và off-host backup còn ngoài bằng chứng local. Checkpoint mới: `r18-r22-checkpoint.json`.

## R18 bổ sung — INT-02 thanh toán lỗi, retry và webhook lặp (2026-10-23)

Đã thêm E2E run-bound qua local mock gateway. Attempt đầu nhận FAILED, order còn PENDING và hold chưa mất; retry giữ nguyên order, tạo `attemptNo=2`; SUCCESS webhook chuyển order thành PAID. Gửi lại SUCCESS webhook thêm lần nữa vẫn chỉ có một payment SUCCEEDED, một vé VALID và một ticket-mail outbox job. Buyer đọc được PAID qua endpoint đơn và đúng một vé qua `/tickets/me`. Oracle PostgreSQL độc lập: `int02-retry-payment-oracle.json`; fixture cleanup xác nhận event/showtime/user còn lại đều bằng 0 (`int02-fixture-cleanup.json`). Không bật worker mail; job ở QUEUED và không gửi email thật.

Full API E2E hiện tại: 22 file/134 test PASS; focused mock-gateway 6/6 PASS; API lint exit 0 (23 cảnh báo repository). `INT-02` được cập nhật PASS trong `results.json`. Coverage hiện: **61 PASS, 0 FAIL, 4 BLOCKED, 1 MISSING, 4 NEEDS_DECISION, 362 NOT_RUN**. R18 tiếp tục IN_PROGRESS: INT-01 buyer checkout browser journey, INT-08 refund/sale/revoked-QR reconciliation, INT-14 infrastructure-failure atomicity/UI recovery và các ca ghế/map/price/clock/device chưa đủ bằng chứng. Mock gateway không phải provider thật.


## Checkpoint R18 — INT-08 (2026-10-23)

INT-08 và bốn mệnh đề con `.01`–`.04` đã PASS trên PostgreSQL cô lập: hoàn toàn bộ đơn bằng mock, ghế được nhả và mua lại bởi người khác, QR trước khi hủy bị từ chối (`UNKNOWN_TICKET`) không tạo admission, audit gắn actor, và báo cáo tài chính đối soát gross 250.000 − discount 1 − refund 249.999 = net 0. E2E hiện tại: 1 file / 8 test PASS. Hoàn tiền chỉ theo policy local mock, không phải provider thật; sản phẩm chỉ hỗ trợ hủy/hoàn toàn đơn, không khẳng định hoàn từng vé. R18 vẫn IN_PROGRESS vì INT-01, INT-14, các ca ghế/map/giá/clock/device, T-31 staging và GOV-06 chưa đủ bằng chứng.

Coverage sau checkpoint: 436 dòng — 66 PASS, 0 FAIL, 4 BLOCKED, 1 MISSING, 4 NEEDS_DECISION, 361 NOT_RUN.

Lint API và typecheck API chạy sau chỉnh sửa test đều PASS; lint giữ các cảnh báo repository có sẵn. Coverage 436 dòng là số hiện tại; dòng tổng hợp 61 PASS ở phần INT-02 phía trên là checkpoint lịch sử, được checkpoint INT-08 này thay thế.


## Checkpoint R18 — INT-14 gateway-init failure (2026-10-23)

E2E trên profile PostgreSQL cô lập (local mock, 1 file/7 test PASS) đã tái hiện transport failure sau khi payment attempt commit: API HTTP 500; order vẫn PENDING; ghế vẫn held/unsold; không có vé; DB còn một payment INITIATED. Hệ thống chưa xác minh được provider có nhận request hay không, vì vậy việc tự đổi FAILED hoặc cho retry có thể không an toàn. D17 đang chờ quyết định về reconciliation/retry. Assertion hẹp về containment PASS; INT-14 tổng thể NEEDS_DECISION; kiểm tra browser recovery và dependency outage/restart còn NOT_RUN. Không gọi provider thật.

Coverage sau INT-14: 439 dòng — 67 PASS, 0 FAIL, 4 BLOCKED, 1 MISSING, 6 NEEDS_DECISION, 361 NOT_RUN.


## Tiếp tục R18 — D17 đã chốt và luồng thanh toán mơ hồ được kiểm tra

D17: từ chối rõ ràng cho phép thử lại; timeout/lỗi vận chuyển mơ hồ giữ attempt ở INITIATED, khóa thử lại và yêu cầu đối soát. API trả PAYMENT_OUTCOME_UNKNOWN; lần gọi tiếp bị chặn bằng PAYMENT_RECONCILIATION_REQUIRED. Quyết định người dùng được lưu trong decision-register.json.

INT-14 và các mệnh đề .01–.03 hiện PASS cho phạm vi local hiện tại: isolated PostgreSQL/API E2E xác nhận order vẫn PENDING, ghế còn giữ/chưa bán, không phát ticket và không tạo payment attempt thứ hai; API/web tests, build và typecheck có log đính kèm; browser desktop 1440×1000 và mobile 390×844 thao tác đúng trang order-review, nhận kết quả mơ hồ, hiển thị yêu cầu đối soát, khóa nút thanh toán và chỉ gửi một POST. Browser dùng route fault injection ở API boundary; backend state được xác minh độc lập bằng E2E PostgreSQL.

Kết quả hiện tại của results.json: 439 dòng, PASS 70, FAIL 0, BLOCKED 4, MISSING 1, NEEDS_DECISION 4, NOT_RUN 360. Đây không phải nghiệm thu toàn dự án: test với gateway/provider thật, staging, khả năng đối soát bên ngoài và các yêu cầu R00–R23 còn mở vẫn chưa được chứng minh. Browser smoke tổng dừng tại reschedule vì fixture nhận trạng thái không như kỳ vọng; log/screenshot chẩn đoán được giữ lại, không thay expected để xanh.

Checkpoint chi tiết: r18-d17-checkpoint.json; screenshot: d17-payment-unknown-desktop.png, d17-payment-unknown-mobile.png.


## Tiếp tục R19 — INT-05 soát vé, replay và ngoại lệ

INT-05 và các mệnh đề .01–.03 PASS ở phạm vi local: test E2E lọc trên PostgreSQL cô lập đạt 7/7; oracle độc lập xác nhận một NORMAL, replay idempotent, duplicate trả cửa/giờ vào đầu tiên, quét đồng thời chỉ có một lần vào thành công; exception cần quyền canOverride theo suất/cửa, lưu reason/staff/gate/owner confirmation, giữ nguyên lần NORMAL và không nhân dòng khi replay. UI override desktop/mobile có ảnh browser đã lưu từ R19. Không suy ra camera vật lý, 4G hoặc staging từ kết quả này.

Tổng results.json: 442 dòng; PASS 74, FAIL 0, BLOCKED 4, NEEDS_DECISION 4, MISSING 1, NOT_RUN 359. R19 vẫn IN_PROGRESS; INT-06/07/10/15/16 và các prerequisite thiết bị/mạng còn mở. Chi tiết: r19-int05-checkpoint.json.


## Tiếp tục R09 — các lát cắt core trên browser

Browser smoke hoàn tất exit 0 trên build local hiện tại: catalog loading/empty/error/populated, organizer hide/re-publish, reschedule past/future, organizer CSV download và admin mail empty-state. INT-12.UI-01–.05 là các assertion hẹp mới được thêm; INT-12 tổng thể vẫn NOT_RUN vì smoke chưa chạy buyer purchase/payment, token reset lifecycle, SMTP catcher delivery, retry/filter mail hoặc tất cả DB oracle.

Smoke ban đầu thất bại do fixture reschedule có admission sẵn; fixture được tách showtime sạch và cleanup đã hoàn tất. Lượt sau CSV assertion sai ở cách quote từng ô; harness được chỉnh để kiểm contract CSV hiện hữu, không đổi sản phẩm/expected. Rerun 2 exit 0; UI/HTTP evidence đã lưu. Worker email tắt, nên QUEUED được ghi là chưa gửi.

Results hiện tại: 447 dòng; PASS 79, FAIL 0, BLOCKED 4, NEEDS_DECISION 4, MISSING 1, NOT_RUN 359. R09 vẫn IN_PROGRESS. Checkpoint: r09-browser-slices-checkpoint.json.


## Tiếp tục R19 — INT-06 conflict giữa hai thiết bị offline

INT-06, .01 và .02 PASS local. Hai Chromium context độc lập (desktop/mobile) cache cùng snapshot, quét cùng vé khi offline; B có timestamp muộn hơn đồng bộ trước, A có timestamp sớm hơn đồng bộ sau. Hai request API đều 200. Oracle PostgreSQL xác nhận đúng hai scan log khác device ID, lưu scannedAt/receivedAt/offset; A là ACCEPTED và admission NORMAL duy nhất, B là CONFLICT; checkedInAt đúng thời điểm thiết bị A. Báo cáo conflict browser hiển thị vé, cửa thắng/thua, thời điểm và offset trên cả hai viewport. Fixture được cleanup.

Đây là kiểm tra hai browser context trên localhost, không phải hai máy quét vật lý, 4G hoặc staging. R19 tiếp tục IN_PROGRESS vì INT-07/10/15/16 và kiểm tra ngoại vi vẫn mở. Checkpoint: r19-int06-checkpoint.json.


## R19 — INT-07 hàng đợi offline, retry và cách ly tài khoản

INT-07 và các assertion .01–.03 PASS trong profile local cô lập. API/Web được build từ source hiện tại (exit 0). Hai lượt kiểm tra dùng fixture sạch riêng cho mobile 390×844 và desktop 1440×1000. Browser quét offline; API thật ghi nhận yêu cầu và trả ACK 200 nhưng response bị ngắt ở browser. IndexedDB vẫn giữ cùng requestId; sau tải lại/đăng nhập lại, retry nhận ACK mà PostgreSQL chỉ có một offline scan và một NORMAL admission cho mỗi ticket. Các response 401/403/409/500/503 được chèn ở biên API; requestId còn nguyên và retryCount tăng sau từng lỗi. Khi chuyển sang synthetic STAFF khác, không có POST đồng bộ hàng đợi của tài khoản cũ; trở lại tài khoản chủ thì hàng đợi đồng bộ thành công. Không có page error; fixture đã dọn, API/Web đã dừng.

Bằng chứng desktop/mobile và PostgreSQL oracle: r19-int07-offline-recovery-browser*.json, int07-postgres-oracle*.json và sáu ảnh int07-*.png. Lượt đầu chỉ gặp lỗi trong API Playwright của harness (waitForRequestFailed không tồn tại); log/JSON thất bại được giữ riêng và lượt sửa dùng event API đúng, không thay expected sản phẩm.

Results hiện có 452 dòng: 86 PASS, 0 FAIL, 4 BLOCKED, 1 MISSING, 4 NEEDS_DECISION, 357 NOT_RUN. R19 còn INT-10/15/16 cùng camera/4G/staging; nghiệm thu toàn dự án chưa hoàn tất. Chỉ xác nhận local browser/API/PostgreSQL, không suy ra provider thật, SMTP Inbox hay staging. Checkpoint: r19-int07-checkpoint.json.


## INT-09 — huỷ suất: xác nhận UI và đóng bán ngay (phần .01)

INT-09.01 PASS trên browser desktop 1440×1000 và mobile 390×844. Organizer đăng nhập, chọn suất, xác nhận huỷ; API trả 200 và job giữ QUEUED khi lifecycle worker chủ động tắt. Browser của buyer thử giữ ghế fixture còn trống nhận 409 SHOWTIME_CLOSED. Oracle PostgreSQL xác nhận showtime CLOSED, order PENDING thành CANCELLED, order PAID vẫn chờ worker, chưa tạo refund/outbox. Fixture được dọn. INT-09 tổng thể vẫn NOT_RUN: chưa chạy nhiều batch qua restart, failure/retry của một refund, kiểm mọi vé và SMTP catcher.

## INT-10 — thu hồi role, disable account và giữ queue ngoại tuyến

INT-10 và .01–.03 PASS local trên desktop/mobile. Với hai lượt fixture tách biệt, browser giữ scan offline trong IndexedDB; sau khi thu hồi STAFF, app không gửi sync POST và API từ chối trực tiếp bằng 403. Khi disable account mà session còn tồn tại, API trả 401. Cùng requestId còn pending trong cả hai trạng thái. Sau khi khôi phục account và role, cùng hàng đợi nhận ACK 200. Oracle PostgreSQL xác nhận đúng hai scan ACCEPTED và hai admission NORMAL, không trùng; không có page error. Các thay đổi role/active chỉ áp dụng fixture, sau đó fixture được dọn và API/Web dừng.

Bằng chứng: r19-int10-role-session-browser.json, int10-postgres-oracle.json, sáu ảnh INT-10; INT-09 UI và oracle ở int09-show-cancel-browser.json/int09-postgres-oracle.json. Harness có các lượt lỗi ban đầu được giữ lại; lỗi tải scanner và chờ redirect được sửa ở harness, không thay expected sản phẩm.

Results hiện có 456 dòng: 91 PASS, 0 FAIL, 4 BLOCKED, 1 MISSING, 4 NEEDS_DECISION, 356 NOT_RUN. R19 vẫn IN_PROGRESS; R20/INT-09 và nghiệm thu ngoài local chưa hoàn tất. Checkpoint: int09-int10-checkpoint.json.

### INT-09 — batch cancellation và retry refund (2026-10-23)

INT-09.02 PASS trên profile PostgreSQL cô lập. Huỷ suất fixture với 22 đơn PAID và 1 PENDING; worker chạy qua nhiều tiến trình Node mới và batch giới hạn. Oracle độc lập xác nhận showtime `CLOSED`, cancellation job `COMPLETED`, 22/22 vé `CANCELLED`, 22/22 refund `SUCCEEDED` duy nhất theo order, 23 attempt rows (một refund có đúng 2 lần thử sau lỗi mock), và không còn ghế được bán. Fixture được dọn theo run-id.

Giới hạn: worker email thật tắt; 22 operation-mail outbox là `QUEUED`, 0 `SENT`; chưa chứng minh SMTP catcher nhận thư hay toàn bộ lifecycle thông báo. Do đó INT-09 tổng thể vẫn `NOT_RUN` dù `.01` và `.02` đã PASS. Không có email gửi người thật. Bằng chứng: `int09-batch-postgres-oracle.json`, `int09-batch-cleanup.json`, các log `int09-batch-*.log`.

Kết quả hiện có 457 dòng: PASS 92, FAIL 0, BLOCKED 4, MISSING 1, NEEDS_DECISION 4, NOT_RUN 356. Các PASS này chỉ là lát cắt cục bộ đã có bằng chứng; nghiệm thu toàn bộ vẫn chưa hoàn tất.

### INT-09 — hoàn tất kiểm thử local cô lập (2026-10-23)

INT-09 và các lát cắt .01–.04 PASS trên profile local riêng. Đã đóng bán ngay qua Organizer UI; chạy huỷ 22 đơn PAID + 1 PENDING qua các batch ở tiến trình worker mới; tiêm đúng một lỗi refund mock rồi retry thành công; oracle Postgres xác nhận 22 refund thành công duy nhất/order, 22 vé huỷ, toàn bộ ghế giải phóng và job COMPLETED. Lifecycle worker chỉ bật trong profile thử và Mailpit nhận đủ 22/22 Message-ID fixture; mọi recipient thuộc miền .invalid, không gửi email thật. Organizer/accountant xem trang operations ở 1440×1000 và 390×844; UI hiện COMPLETED, SUCCEEDED 22, API 200, không page error/overflow. Fixture cleanup hoàn tất.

Giới hạn: đây là local mock refund và SMTP catcher acceptance; không chứng minh gateway/provider thật, staging hoặc Inbox người nhận. Bằng chứng chi tiết: int09-int10-checkpoint.json, int09-batch-postgres-oracle.json, int09-mailpit-catcher-oracle.json, int09-operations-accounting-browser.json và hai ảnh operations.

Kết quả hiện có 459 dòng: PASS 95, FAIL 0, BLOCKED 4, MISSING 1, NEEDS_DECISION 4, NOT_RUN 355. INT-09 đã khép trong giới hạn local nêu trên; R19 và nghiệm thu toàn dự án vẫn IN_PROGRESS. Không sửa source sản phẩm trong lượt này.


## Checkpoint 60 phút — INT-16 transfer recipient failure (2026-10-23)

Confirmed open product defects: **1** (BUG-INT16-01, P2, S-57 Later/Could; not an independent release gate). API transfer returned 201, the prior owner QR disappeared, but recipient ticket list returned 200/0 and order-ticket lookup returned 404. PostgreSQL showed a new VALID ticket with no order link and no transfer-mail outbox row. Paid order total and OrderItem count did not increase. Browser evidence exists at desktop and mobile; database oracle is independent.

Results were split from the source baseline without modifying source AC: INT-16.01 = FAIL with evidence; INT-16.02 = NOT_RUN (reschedule/cancel/erasure/scanner not yet exercised); parent INT-16 remains NOT_RUN until its full compound flow is tested. Current matrix: 461 rows — PASS 95, FAIL 1, NOT_RUN 356, BLOCKED 4, MISSING 1, NEEDS_DECISION 4.

Local work not closed: 356 NOT_RUN rows, especially Ready/Must (110), Next/Must (22), Next/Should (24), Ready/Should (16), plus Later/Technical/Governance; R10, R18–R22 remain in progress and R23 planned. Earlier localized regression logs remain evidence only for their exact source/test scope; full exact-source handoff regression remains. External blockers: staging, real payment provider, physical device/camera/4G, hosted CI and off-host backup receiver. No additional business decision is currently needed to continue local work. Estimated local closeout: 2–4 focused working days, subject to findings from the 404 sweep.
