# Bug retest checkpoint — run 20261022T230000-remediation

## BUG-01 — API fresh build blocked by activation decrypt contract (resolved locally)
- Severity: P1; requirements: INT-12, GOV-03.
- Baseline actual: imported `decryptActivation` did not exist; publication spec referenced absent service surface.
- Current state: `decryptActivation` is exported and AES-GCM regression passes; publication implementation is mounted.
- Evidence: `api-unit-final.log`, `api-build-final.log`, `api-typecheck-final.log`.

## BUG-02 — Core completion routes/UI unreachable (resolved locally; external acceptance pending)
- Severity: P1; requirements: INT-12, EXT-RESET-01/02, EXT-PUBLISH-01, EXT-RESCHEDULE-01, EXT-MAIL-01.
- Baseline actual: module not mounted and controls had no page integration.
- Current actual: publication, reschedule, forgot-password and mail-failure controls are reachable; publication/reschedule/admin flows have browser evidence on isolated app. Reset email delivery remains external-provider validation; workers stayed disabled.
- Evidence: `browser-ui-smoke.json`, `publication-ui-success.png`, `reschedule-ui-success.png`, `admin-mail-failures-empty.png`, `smtp-catcher-after-browser.json`.

## BUG-03 — Web API proxy dropped attachment filename (fixed and retested)
- Severity: P2; requirement: S-60-AC01.
- Fixture: run-bound organizer, 2,002 synthetic seats, local PostgreSQL profile.
- Reproduction: request `/api/showtimes/<owned-showtime>/manage/seats.pdf` via the web app; API returned PDF but the proxy forwarded only content-type/retry-after, stripping Content-Disposition.
- Expected: browser receives attachment filename and PDF content type.
- Actual before fix: status 200 and valid PDF, but no `content-disposition` at the public web origin.
- Fix: proxy allowlist now forwards `content-disposition`; focused proxy suite 7/7 passes.
- Retest: browser receives PDF via UI, verifies owner success, non-owner 403, loading/error states, 1 page, embedded font; rendered artifact verified with Poppler.
- Evidence: `r14-proxy-test.log`, `r14-browser.log`, `seat-pdf-browser.json`, `r14-pdfinfo.log`, `seat-map-render-1.png`.

## Current defect disposition
- No new open product bug from S-60 verification. Keep S-56/S-59/S-63 and non-local acceptance items as gaps/decisions, not bug failures.
## T-31 harness observations

- First real API burst used the default 240 requests/IP/minute and produced `BOOKING_RATE_LIMIT` noise after the first round. That run is preserved as `seat-race-rate-limit-contaminated.*` and is not counted as a valid result.
- The isolated profile manager now sets test-only account/IP quota caps high enough for this measurement, and the CI profile runs the same production HTTP route with a client barrier.
- Valid rerun: 10/10 rounds each returned 100 HTTP 200 and 100 HTTP 409, with zero 429; SQL oracle saw 100 active holds on 100 unique seats. 2,000 raw latency records are retained. p95/max are local-loopback measurements, not staging SLA.
- T-31 AC remains BLOCKED pending a real staging run. T-31 NFR remains BLOCKED until hosted CI actually executes the new job.
## Additional current-suite observations

- The first full E2E run after profile-origin changes had one fixture mismatch (`Origin: localhost:3000` vs browser origin `127.0.0.1:3410`). The profile E2E runner now supplies the fixture's documented localhost origin; the browser profile retains 3410. The failed run is preserved as `e2e-origin-mismatch.*`.
- A later full E2E run timed out the existing 2,000-seat bulk-hold test at its unchanged 5-second test timeout; no timeout/SLA was increased. Filtered rerun passed in 1.38 seconds, then the full suite passed 102/102. Preserve the original timeout observation in `e2e-current-all.log`.
- Current API unit: 56 files / 449 tests passed. Current Web unit (before the latest S-40 UI loading follow-up): 25 files / 156 tests passed; latest full web suite after that change is 26 files / 158 tests. API and Web lint commands exited 0; existing API lint warnings remain recorded.

## R19 check-in concurrency retest

- Isolated API/PostgreSQL run: 	est/ticket-check-in.e2e-spec.ts, 4/4 passed. Concurrent duplicate request returned one 200 and one 409; order item timestamp persisted. Existing migration has the partial unique NORMAL-admission constraint.
- S-31-AC02 and S-31-NFR now PASS in esults.json; S-31-AC01 and S-31-AC03 remain NOT_RUN because evidence did not assert prior gate/time response or manual override behavior.
- Scanner page opened in browser: online, queue count 0, authentication prompt shown. Authenticated UI/camera and offline IndexedDB persistence/replay are BLOCKED pending authorized staff session/device workflow; no unit/API substitute is counted as UI evidence.
- Log: 19-check-in-e2e.log; decision and browser notes: 11-r19-checkpoint.json.


## R18 duplicate payment webhook retest

- Filtered isolated PostgreSQL E2E: payments-idempotency.e2e-spec.ts, 4/4 passed; includes sequential delivery five times, concurrent duplicate deliveries across three iterations, expired order handling, and read-after-webhook for buyer.
- S-20-AC02, S-20-AC03, S-20-AC04 now PASS. S-20-AC01 remains NOT_RUN for the whole clause because the test does not assert ticket count after replay; S-20-NFR and S-23-AC03 remain NOT_RUN because transaction-key locking and a simultaneous expiry-worker/webhook barrier are not directly evidenced.
- Evidence: 18-webhook-e2e.log. Mock-compatible local integration only; not a provider sandbox.


## S-45 approved local/mock cancellation retest

- Added pps/api/test/lifecycle-cancellation.e2e-spec.ts: isolated PostgreSQL/API 4/4 pass. Whole paid order, two tickets, 100% refund, both seats released; rejected unrelated buyer, checked-in order and a show starting inside 24h; concurrent cancel calls returned the same refund and one database refund. Worker method processed the refund through MockRefundGateway; no external money moved.
- pps/api/src/lifecycle/lifecycle.spec.ts passed 14/14, including exact 24h boundary and 1ms-after cutoff. API lint exited 0; pre-existing warnings remain, and this new test adds no lint warning.
- Browser Chromium against the local app verified desktop and mobile buyer UI: preview amount, loading, injected 503 error, confirmation, and queued refund result; 390px viewport had no horizontal overflow. Browser errors: 0. Fixture cleanup verified and credentials were stored only in run-bound private .cache, then removed.
- S-45-AC01 PASS under the separately approved local/demo policy; S-45-NFR remains BLOCKED for real provider-sandbox capability. Evidence: 18-s45-cancellation-e2e.log, 18-s45-cancellation-unit.log, s45-cancellation-browser.json, screenshots and cancellation-browser-fixture-cleanup.json.


## S-48 retry and manual ACCOUNTANT queue retest

- New isolated PostgreSQL E2E forced three mock gateway failures. It verified attempts 1/2 schedule increasing delays, attempt 3 becomes FAILED with reason, the ACCOUNTANT operations route lists the item, and explicit esolve-mock produces deterministic mock success. The test advances 
extAttemptAt directly after asserting the computed delay, so it does not claim real waiting time or a real provider. Three durable refund-attempt rows were retained until fixture cleanup.
- S-48-AC01 PASS; S-48-NFR NEEDS_DECISION for unrefined alert channel/manual handling SLA.
- 20-s48-refund-retry-e2e.log; the full API E2E rerun after adding the test passed 19 files / 107 tests (2e-after-s48.log). API unit 56/449 and lint exit 0 (pi-unit-after-s45.log, pi-lint-after-remediation-tests.log).


## S-40 waiting-room UI loading follow-up

- Reproduction: browser loaded the authenticated seat selection route while `/api/showtimes/:id/waiting-room` response was delayed; the notice previously rendered nothing until a response arrived.
- Change: `WaitingRoomNotice` now exposes `role=status` with “Đang kiểm tra lượt đặt vé…” while the admission request is pending. Added component tests for loading and disabled/empty state.
- Retest: focused UI 2/2; full web 26 files/158 tests; lint/typecheck/build pass. Authenticated browser verified delayed loading, admitted desktop, FIFO mobile position, 503 error and no page errors. API E2E independently verified lease expiry/promotion and route guard on isolated Redis/PostgreSQL.
- Evidence: `apps/web/src/features/lifecycle/waiting-room-notice.tsx`, `apps/web/src/features/lifecycle/waiting-room-notice.spec.tsx`, `s40-waiting-room-browser.json`, screenshots prefixed `s40-waiting-`, `r20-s40-waiting-room-e2e.log`, `s40-browser-fixture-cleanup.json`.
- Policy status: S-40 NFR remains NEEDS_DECISION; test-only capacity/lease do not set production values.


- Final S-40 regression after adding an expired-lease HTTP guard assertion: filtered E2E 1/1 and full API E2E 20 files/108 tests PASS; API lint exit 0 with existing warnings. Expired buyer's hold and order requests both return `429 WAITING_ROOM_REQUIRED`.


## BUG-R19-01 — retest 2026-10-23

**Result: PASS local.** Added persistence of an accepted `initialShowtimeId`. After a fresh optimized build, the browser completed snapshot download and offline scan, closed/relaunched the persistent profile offline, restored showtime and gate with the ticket input enabled, and retained the same pending queue record. Full Web unit 26/158, Web typecheck/build/lint passed; API E2E 20/112 passed on the run-bound PostgreSQL profile. Real camera/4G remain outside this result.


### R19 retest bổ sung: batch 40 scan

PASS S-35-AC01 ở local isolated profile. Repro qua UI với 40 vé khác nhau; queue bền vững qua browser relaunch; reconnect phát một request batch 40, 40 ACK hợp lệ, queue về 0; PostgreSQL oracle xác nhận đúng 40 scan ACCEPTED và 40 admission NORMAL. Fixture có run-id và đã dọn. Xem `r19-browser.json`, `r19-fixture-verify.log`, `r19-fixture-cleanup.log`. Chưa phủ lost-ACK/partial batch nên S-35-AC02 vẫn NOT_RUN.


### R19 partial ACK/retry retest

PASS S-35-AC02 và S-35-NFR cho profile local: server thật commit 40; fault injection giới hạn ACK nhìn thấy ở browser còn 20; UI giữ đúng 20 pending; lần gửi tiếp chỉ gồm 20 ID cũ; SQL oracle xác nhận một scan row/admission cho mỗi ID. Thiết bị và sự cố transport thật vẫn chưa kiểm.

## Retest D13 — 2026-10-23

S-33-AC01/NFR migration và snapshot đã chạy lại qua Chromium hiện tại: IndexedDB v3→v4 xóa trường legacy khỏi ticket, chỉ giữ `showtimeId`, `code`, `status`; bảo toàn durable scan pending và metadata suất. Browser tải đủ 40 vé và xác nhận field set; offline queue tồn tại qua browser relaunch, ACK local PostgreSQL rồi được dọn. S-35-AC02 partial ACK cũng PASS với 20/40 ACK, giữ và gửi tiếp đúng 20 ID ban đầu; SQL độc lập xác nhận không nhân admission. Các hàng này được cập nhật PASS trong results.json; checkpoint mới là r19-d13-checkpoint.json. Fixture run-bound cleanup PASS. Vẫn local-only, không chứng minh camera/4G hoặc staging.

## BUG-S56-01 — Retest 2026-10-23

FIXED/VERIFIED locally after adding the missing order-history projection. Browser apply/invalid/remove scenarios pass across desktop and mobile; API returns correct 400/200 statuses, and database oracle shows 101/0/101 after removal with coupon redemption RELEASED. Current API unit suite 60/468, isolated coupon E2E 4/4, typecheck/build/lint pass. Buyer browser evidence and screenshots are in the S-56 evidence list in `results.json`.
