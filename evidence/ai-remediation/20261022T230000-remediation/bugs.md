# Bugs found during remediation

## BUG-R19-01 — Query-selected showtime is not persisted for offline scanner relaunch

- **Severity:** P1 (offline scanning becomes unavailable after relaunch in the supported `?showtimeId=` entry path)
- **Requirement/case:** S-34-NFR, R19 step 4; scanner offline shell and local grant restoration
- **Fixture:** Run-owned synthetic STAFF, one paid ticket, one gate, isolated PostgreSQL profile `20261022T230000-remediation`; Chromium persistent profile; no real customer data
- **Reproduction before fix:**
  1. Open `/scanner?showtimeId=<fixture-showtime>` while online, load the assigned gate, and wait for “Giao diện đã sẵn sàng mở lại khi mất mạng.”
  2. Scan the signed fixture QR offline; verify one pending `durable_scans` row.
  3. Close the persistent Chromium context and launch it again offline at the same `/scanner?showtimeId=...` URL.
  4. The service worker serves its cached `/scanner` shell without the query string. Local storage contains the STAFF identity and showtime grant, but `checkin_showtime_s29` was absent because the accepted initial query value had never been saved.
- **Expected:** The scanner restores the selected showtime and gate, keeps the input available for more offline scans, and keeps the pending queue.
- **Actual before fix:** Queue count remained 1, but the scanner had no showtime/gate controls or ticket input and displayed “Không thể kết nối. Kiểm tra kết nối rồi thử lại.” The query string disappeared on the offline shell response.
- **Evidence before fix:** `r19-pre-fix-repro.json` (`offlineReopenState`: saved showtime false, staff identity true, grant true, input missing), `r19-browser-queue-persistence.json`. The failed pre-fix run did not retain an image; post-fix desktop/mobile screenshots are preserved.
- **Fix:** When the online `/check-in/today` response accepts `initialShowtimeId`, persist that ID to `checkin_showtime_s29`, matching the manual select path.
- **Retest:** FIXED/VERIFIED locally on a fresh profile. After optimized web build, authenticated Chromium reopened offline from cached `/scanner` with selected showtime and Gate A restored, ticket input enabled, and same pending `requestId` preserved. Web typecheck/build/lint passed; focused scanner tests 49/49 and full web unit suite 26 files/158 tests passed. Full API E2E remains 20 files/112 tests on the same isolated profile. Evidence: `r19-browser.json`, `r19-offline-reopened-mobile.png`, `r19-web-build.log`, `r19-web-typecheck.log`, `r19-web-full-unit.log`, `r19-web-full-lint.log`, `r19-full-api-e2e.log`.

## BUG-S11-01 — Hold-seat action button overflows the seat card on desktop/mobile

- **Severity:** P2 (buyer can still trigger release, but seat rows overflow and the summary obscures the map on mobile)
- **Requirement/case:** S-11-AC01, S-11-AC02; release UX at desktop and mobile breakpoints
- **Fixture:** Synthetic run-bound S-11 event/showtime, 3 seats, isolated PostgreSQL profile, synthetic BUYER only
- **Reproduction before fix:** At 535×756 or 1280×800, sign in as the S-11 fixture buyer, hold 3 seats and view the summary. Each nested “Bỏ ghế” button inherited `width:100%` from the summary action rule, causing horizontal overflow; mobile also used a sticky summary over the map.
- **Expected:** Release controls stay within each seat card, summary remains in document flow on mobile, and the map remains visible.
- **Actual before fix:** The button extended beyond the card; the mobile summary covered part of the map. Evidence: `s11-mobile-release.jpg`.
- **Fix:** Scoped nested hold-seat actions to intrinsic width/fixed flex sizing; keep the mobile hold summary static and prevent text overflow.
- **Retest:** Web production build, typecheck and 157/157 unit tests pass. Actual buyer UI rechecked at 535×756 and 1280×800; browser DOM bounding boxes show each 88px action button within its card. Final screenshots: `s11-mobile-release-fixed.jpg`, `s11-desktop-release-fixed.jpg`.

## BUG-S56-01 — Order detail omits coupon price snapshot after apply

- **Severity:** P2 (the payment total remained correct, but the buyer-facing coupon breakdown and applied-code state were wrong after refresh)
- **Requirement/case:** S-56-AC01, S-56-AC01.07; buyer applies/removes coupon and sees refreshed server pricing
- **Fixture:** Synthetic BUYER session, pending 101-VND order, 10% coupon, run-owned isolated PostgreSQL profile; no real customer or payment data
- **Reproduction before fix:** Open `/orders/<fixture-order>`; apply `S56FLOOR10`; the coupon endpoint returns HTTP 200 and the order detail is refetched. The response projection omitted `subtotalAmount`, `discountAmount`, and `couponCode`; the decoder fell back to payable amount for subtotal and zero for discount, and treated the code as absent.
- **Expected:** After apply, UI shows subtotal 101, discount 10, code `S56FLOOR10`, payable 91; after remove, subtotal/payable return to 101 and discount to zero.
- **Actual before fix:** Apply succeeded server-side, but the UI did not enter the applied-code state and its breakdown defaulted to a subtotal of 91 and a zero discount.
- **Fix:** `OrderHistoryService.current` now selects and returns the immutable coupon subtotal/discount/code fields used by the order review.
- **Retest:** Authenticated Chromium current build passed apply (HTTP 200), invalid-code error (HTTP 400), server-refreshed subtotal 101/discount 10/payable 91, remove (HTTP 200), and restored subtotal/payable 101/discount 0. Desktop applied and mobile removed screenshots show no horizontal overflow. Independent PostgreSQL oracle confirmed the final snapshot and RELEASED redemption, with no payment row; fixture cleanup passed. API typecheck/build/lint passed; API unit 60/468 passed; isolated coupon E2E 4/4 passed. Evidence: `s56-buyer-browser.json`, `s56-browser-db-oracle.json`, `s56-buyer-coupon-applied-desktop.png`, `s56-buyer-coupon-removed-mobile.png`, `r12-api-unit-current.log`, `e2e.log`.

## BUG-R13-02 — Waitlist email used stale seat availability at SMTP boundary

- **Severity:** P2 (a subscriber could be emailed that seats opened after every released seat had already been bought)
- **Requirement/case:** D16, S-59; supplemental `R13-PLAN-06.05`
- **Fixture:** Run-bound synthetic waitlist subscriber and showtime in isolated PostgreSQL profile `20261022T230000-remediation`; Mailpit catcher only.
- **Reproduction:** Queue a waitlist notice while one seat is available. Let the worker complete its initial availability validation, then commit a purchase that marks all seats sold immediately before the final SMTP-boundary check. Call `WaitlistService.deliverNotification()`.
- **Expected:** Recheck availability immediately before SMTP; if sold out, suppress email, cancel the stale notification and return the subscriber to ACTIVE FIFO state.
- **Actual before fix:** The worker validated once in a transaction, then called `MailService.send()` without a second availability read; an intervening purchase could therefore leave a stale email eligible.
- **Fix:** Added a final PostgreSQL eligibility and available-seat recheck directly before `MailService.send()`. Sold-out notices are cancelled with `SEATS_SOLD_BEFORE_NOTICE`, the entry returns to ACTIVE, and the SMTP method is not called.
- **Retest:** Deterministic isolated PostgreSQL/Mailpit race, waitlist suite 10/10 PASS; full API E2E 22 files/133 tests PASS; API unit 60/471 PASS; API typecheck/build/lint exit 0 (lint retains 23 repository warnings). Evidence: `r13-waitlist-d16-final.log`, `r22-full-api-e2e-current-133.log`, `r13-waitlist-d16-api-unit.log`, `r13-waitlist-d16-typecheck.log`, `r13-waitlist-d16-build.log`, `r13-waitlist-d16-lint.log`.
- **Limit:** The database read and remote SMTP acceptance cannot be one atomic operation. This implements the approved final recheck; it cannot exclude a new purchase after that read and before SMTP accepts the message.


## BUG-R18-03 — Ambiguous gateway initialization leaves an unresolved payment attempt

- **Severity:** P1 (buyer receives an error while the order remains held; a subsequent retry may create another attempt although provider acceptance is unknown)
- **Requirement/case:** INT-14; S-20, S-23
- **Fixture:** Run-bound synthetic BUYER/order/seat on isolated PostgreSQL; injected local mock gateway failure; no external provider call.
- **Reproduction:** POST `/orders/{id}/pay`; let the service commit its INITIATED payment row, then make `PaymentGateway.createPayment()` throw a simulated transport failure.
- **Expected:** Order/seat/ticket state must stay safe, and recovery must not risk duplicate charge. The repository has no approved rule for resolving an ambiguous provider outcome.
- **Actual:** API returns 500; order stays PENDING, seat remains held and unsold, and no ticket is issued, but one payment remains INITIATED with a pending reference.
- **Evidence:** `r18-int14-gateway-failure-repro.log`; `apps/api/test/mock-gateway.e2e-spec.ts`.
- **Disposition:** Fixed in the current local source under approved D17. Explicit rejection is retryable; ambiguous outcome remains INITIATED and requires reconciliation. Local E2E, adapter/unit, and desktop/mobile UI evidence is recorded in `d17-browser-verification.json` and `r18-d17-*`. External provider/staging behavior remains unverified.


## BUG-INT16-01 — Người nhận không nhận được quyền/vé sau chuyển nhượng

- **Severity:** P2; S-57 thuộc Later/Could và không tự xem là release gate độc lập.
- **Requirement/case:** S-57-AC01, INT-16.01.
- **Fixture:** Synthetic owner/recipient, một đơn PAID và một ghế trong profile PostgreSQL cô lập; recipient dùng miền .invalid, không gửi email thật.
- **Reproduction:** Chuyển vé qua POST /orders/{id}/tickets/{ticketId}/transfer; đăng nhập recipient và mở danh sách vé; kiểm tra DB/outbox.
- **Expected:** Vé mới có QR mới và quyền truy cập thuộc recipient; QR cũ vô hiệu; audit lưu; tổng tiền và số vé bán không đổi.
- **Actual:** API trả 201; owner không còn QR. Recipient endpoint trả 200 nhưng total=0, order ticket view 404. DB có vé mới VALID nhưng orderId=null; transfer mail outbox có 0 hàng. Order vẫn PAID 125000 VND, OrderItem duy nhất không tăng.
- **Evidence:** int16-transfer-baseline-browser.json, int16-transfer-postgres-oracle.json, int16-owner-after-transfer-desktop.png, int16-recipient-empty-desktop.png, int16-recipient-empty-mobile.png.
- **Disposition:** OPEN. Chưa sửa. Cần xử lý entitlement, QR identity/scanner và durable delivery như một luồng; không vá chỉ UI.
