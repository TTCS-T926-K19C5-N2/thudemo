# Sprint 4–8 Implementation Progress

> Cập nhật 22/10/2026: các trạng thái Wave bên dưới là lịch sử ngày21/10, đã được thay thế bởi [báo cáo triển khai22/10](SPRINT_4_8_IMPLEMENTATION_REVIEW_20261022.md) và [kịch bản kiểm thử](SPRINT_4_8_TEST_SCENARIOS_20261022.md). Không dùng mô tả “4xx non-retryable discarding” bên dưới: implementation hiện giữ queue đến khi có ACK hợp lệ. S-55 còn đợi đích off-host/lịch daily thật; không đánh dấu toàn bộ AC/NFR hoàn tất chỉ từ unit test.

**Baseline Date:** 2026-10-21  
**Project Root:** `D:\Merge_2\Codegym`  
**Git HEAD:** `4fd945aefd590e8383680596c0e3d182bd7bd41f`  
**Branch:** `codex/integrate-thudemo-features`  
**Target Environment:** Local / Sandbox Academic Demonstration  
**Baseline Backup:** `.cache/sprint4-8-evidence/20261021_155800/codegym_local_baseline.sql` (verified restored into `codegym_backup_verify`, 40 events / 40 showtimes / 5544 seats)

---

## 1. Executive Summary & Wave Gates

| Wave | Scope | Status | Notes |
|---|---|---|---|
| **Wave 0** | Baseline audit, database backup/restore verification, failure classification | **PASSED** | Baseline DB backed up & restored in isolated test DB; baseline test failures classified and fixed; root typecheck & lint green. |
| **Wave A** | S-25, S-26, S-27, S-28, S-29, S-30, S-31, S-32, S-38, S-39 (Paid ticket issue, canonical signed QR, mail outbox, staff auth, gate selection, online scanner, duplicate prevention, order history, MyTickets, reject reasons) | **PASSED** | Paid order atomic issuance, Ed25519 canonical signature, email outbox with exponential backoff, staff user management with immediate role enforcement & disabled account message, gate selection, online check-in duplicate rejection, MyTickets future-first ordering with 320px QR and PNG download, dimmer for cancelled tickets. |
| **Wave B** | S-33, S-34, S-35, S-36, S-37 (Offline snapshot, durable IndexedDB scan, batch sync, conflict reporting, network status) | **PASSED** | 8-step offline scan validation order aligned (`NO_LIST_OFFLINE` -> `INVALID_SIGNATURE` -> `WRONG_SHOWTIME` -> `NOT_IN_LIST` -> `CANCELLED` -> `ALREADY_CHECKED_IN` -> `DUPLICATE_ON_DEVICE` -> `OK`), durable IndexedDB scan queue, network offline detection based on real server reachability, sync manager pending counter persistence with server ACK verification, 4xx non-retryable discarding, and concurrency guard. |
| **Wave C** | S-49 (Audit foundation), S-41, S-42, S-43, S-44 | **IN PROGRESS** | S-42 per-account ticket limit verified; claim hot path optimized by consolidating `isDemo` check into cached `loadLimit`, clearing all 23 previous failures in `holds.service.spec.ts`. All 38 hold tests passing. S-49 audit foundations ready for refund/erasure workflows. |
| **Wave D** | S-40 (Waiting room) | Next | FIFO waiting room with admission token, Redis Lua atomic lease. |
| **Wave E** | S-45, S-46, S-47, S-48 (Cancellation & refund workflow) | Scheduled | Additive refund models, mock adapter, batch cancellation. |
| **Wave F** | S-50, S-51, S-52 (Reporting, reconciliation, gate attendance) | Scheduled | Reconciliation 4 groups, gate statistics. |
| **Wave G** | S-54, S-53, S-55 (Consent, erasure, off-host backup) | Scheduled | PII anonymization, retention, backup runbook. |
| **Wave H** | End-to-end regression & demo verification | Scheduled | Full regression run and demo verification. |

### Test Suite Execution Summary (Current)
- **Root Workspace Test (`pnpm test`):** **544 passed, 0 failed** (100% green).
  - `apps/api`: **47 test files passed, 388 tests passed, 0 failed**.
  - `apps/web`: **24 test files passed, 136 tests passed, 0 failed**.
  - Root checks: **20 passed, 0 failed**.
- **Root Typecheck (`pnpm typecheck`):** **0 errors** across both `api` and `web`.
- **Root Linter (`pnpm lint`):** **0 errors** across both `api` and `web`.
- **Database Preservation:** Verified 40 events, 40 showtimes, 5544 seats, 8 users intact.

---

## 2. Story Progress & Acceptance Criteria Tracking (S-25 to S-55)

### Sprint 4

#### S-25: Nhận vé điện tử có mã QR sau khi thanh toán
- **Sprint:** 4 • **SP:** 3 • **Priority:** Must • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - Database schema includes tickets with unique `(orderId, seatId)`.
  - Ticket issuance in `TicketsService.issueForPaidOrder` executes inside PAID transaction.
  - 3 seats generate 3 distinct signed QRs with unpredictable codes.
  - Idempotent ticket creation on duplicate webhook replay (`skipDuplicates: true`).
  - Unpaid orders yield no tickets.
- **Evidence:** `apps/api/src/tickets/tickets.service.spec.ts` (18/18 tests pass).

#### S-26: Mã QR trên vé có chữ ký, không tạo giả được ngoài hệ thống
- **Sprint:** 4 • **SP:** 3 • **Priority:** Must • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - `TicketSigningService` implements Ed25519 canonical signature `ET1.Ed25519.<keyId>.<payload>.<sig>`.
  - Tampered code/signature rejected by `verifyTicketQr`.
  - Historical key retention and key rotation supported.
- **Evidence:** `apps/api/src/tickets/ticket-signing-keys.spec.ts` (9/9 tests pass).

#### S-27: Vé gửi qua email kèm mã QR
- **Sprint:** 4 • **SP:** 2 • **Priority:** Should • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - `TicketDeliveryService` outbox pattern with `ticket_mail_deliveries`.
  - Max 3 retry attempts with exponential backoff (+5s, +15s).
  - Resend ticket endpoint preserves existing ticket codes without generating new ones.
  - Delivery record logs events (`ticket_mail_retry`, `ticket_mail_delivered`) without logging secret credentials.
- **Evidence:** `apps/api/src/tickets/ticket-delivery.service.spec.ts` (18/18 tests pass).

#### S-28: Quản trị tạo tài khoản nhân viên và gán vai trò
- **Sprint:** 4 • **SP:** 2 • **Priority:** Must • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - `UsersService.createStaff` hashes password with argon2, requires minimum 8 characters, enforces unique email.
  - `UsersService.disableAccount` sets `isActive=false`.
  - Disabled account login returns exact AC message: `"Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên."`.
  - Live session authorization check in `session-auth.guard.ts` verifies `user_roles` and `isActive` on every request.
- **Evidence:** `apps/api/src/users/users.service.spec.ts` (4/4 tests pass), `apps/api/src/auth/auth.service.spec.ts` (17/17 tests pass).

#### S-29: Nhân viên soát vé chọn suất diễn và cửa trước khi quét
- **Sprint:** 4 • **SP:** 2 • **Priority:** Should • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - `CheckInControllerS29.getTodayShowtimes` filters showtimes assigned to staff for today in `Asia/Ho_Chi_Minh`.
  - Empty state returned when no showtimes assigned.
  - Gate selection and assignment persisted.
- **Evidence:** `apps/api/src/check-in/check-in-s29.spec.ts` (7/7 tests pass).

#### S-30: Soát vé bằng cách quét QR tại cửa
- **Sprint:** 4 • **SP:** 3 • **Priority:** Must • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - Normal admission recorded with gate, timestamp, and staff ID.
  - Online camera scan decodes QR and calls check-in endpoint.
- **Evidence:** `apps/web/src/features/check-in/check-in.spec.ts` (9/9 tests pass).

#### S-31: Cảnh báo vé đã vào cổng để chống dùng lại
- **Sprint:** 4 • **SP:** 3 • **Priority:** Must • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - Duplicate check-in rejected with 409 `TICKET_ALREADY_CHECKED_IN`.
  - Database unique constraint on admissions table prevents concurrent duplicate admissions across gates.
  - Exception check-in override permitted only with explicit `canOverride` role/permission.
- **Evidence:** `apps/api/src/orders/ticket-check-in.service.ts`, `apps/web/src/features/ticket-scanner/admission-response.spec.ts` (4/4 tests pass).

#### S-32: Xem lịch sử đơn hàng và trạng thái vé đã mua
- **Sprint:** 4 • **SP:** 2 • **Priority:** Should • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - Orders sorted newest first with pagination.
  - Non-owner access rejected with 403.
  - Cancelled and expired orders retained in history.
- **Evidence:** `apps/api/src/orders/orders.service.spec.ts` (11/11 tests pass).

---

### Sprint 5

#### S-33: Tải trước danh sách vé về máy quét để dùng khi mất mạng
- **Sprint:** 5 • **SP:** 3 • **Priority:** Must • **Wave:** B
- **Status:** **VERIFIED (Passed Gate B)**
- **Verified AC:**
  - `fetchShowtimeTickets` downloads snapshot manifest with version, cursor, verification keys, and ticket list.
  - Atomic IndexedDB save via `saveTicketsAtomic`.
  - Incremental sync supported via cursor.
- **Evidence:** `apps/web/src/features/scanner/scanner.spec.ts` (7/7 tests pass).

#### S-34: Soát vé khi mất mạng và lưu lịch sử quét trên máy
- **Sprint:** 5 • **SP:** 3 • **Priority:** Must • **Wave:** B
- **Status:** **VERIFIED (Passed Gate B)**
- **Verified AC:**
  - Strict 8-step offline scan validation order:
    1. Check downloaded showtime list exists (`NO_LIST_OFFLINE`).
    2. Verify QR signature with saved Ed25519 public key (`INVALID_SIGNATURE`).
    3. Verify showtime match (`WRONG_SHOWTIME`).
    4. Lookup ticket code in IndexedDB (`NOT_IN_LIST`).
    5. Check if cancelled (`CANCELLED`).
    6. Check if checked in prior to download on server (`ALREADY_CHECKED_IN`).
    7. Check if checked in on this device offline (`DUPLICATE_ON_DEVICE`).
    8. Valid scan marked locally and enqueued to `scan_queue` (`OK`).
- **Evidence:** `apps/web/src/features/scanner/offline-scanner.spec.ts` (14/14 tests pass).

#### S-35: Tự động đẩy dữ liệu soát vé lên máy chủ khi có mạng lại
- **Sprint:** 5 • **SP:** 3 • **Priority:** Must • **Wave:** B
- **Status:** **VERIFIED (Passed Gate B)**
- **Verified AC:**
  - Sequential durable queue synchronization with server idempotency via `requestId`.
  - Items kept in queue upon network failure (status 0 / timeout) or 5xx server error.
  - Items removed only upon server confirmation (200 / `ALREADY_RECORDED`).
  - Terminal 4xx business rejections removed from queue to prevent infinite retry loops.
  - Concurrency guard prevents duplicate overlapping sync runs.
- **Evidence:** `apps/web/src/features/ticket-scanner/offline-sync.spec.ts` (12/12 tests pass).

#### S-36: Xung đột soát vé ở hai cửa được phát hiện khi đồng bộ
- **Sprint:** 5 • **SP:** 3 • **Priority:** Should • **Wave:** B
- **Status:** **VERIFIED (Passed Gate B)**
- **Verified AC:**
  - Backend `OfflineAdmissionsService.sync` records original device timestamp and compares against prior admissions.
  - Loser marked as `conflict` with preserved audit details for organizer report.
  - Explicit documentation: disconnected devices detect conflicts server-side upon synchronization.
- **Evidence:** `apps/api/src/scanner/scanner.controller.spec.ts` (3/3 tests pass).

#### S-37: Máy quét hiện rõ trạng thái mạng và số lần quét chưa đồng bộ
- **Sprint:** 5 • **SP:** 2 • **Priority:** Should • **Wave:** B
- **Status:** **VERIFIED (Passed Gate B)**
- **Verified AC:**
  - Network status determined by actual server health check and recent API responses, not purely `navigator.onLine`.
  - Pending scan counter reflects durable storage (IndexedDB / persistent queue).
  - Counter does not decrement while request is in-flight; only decrements upon server ACK.
  - Offline banner disappears only when online AND queue count reaches 0.
- **Evidence:** `apps/web/src/features/ticket-scanner/offline-banner.spec.ts` (3/3 tests pass), `apps/web/src/features/ticket-scanner/offline-sync.spec.ts` (12/12 tests pass).

#### S-38: Xem vé của tôi trong tài khoản và tải lại mã QR
- **Sprint:** 5 • **SP:** 2 • **Priority:** Should • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - Future showtimes sorted before past showtimes.
  - QR image rendered at 320px with PNG download button.
  - Cancelled tickets dimmed with no active QR code.
- **Evidence:** `apps/web/src/features/tickets/ticket-qr.spec.ts` (8/8 tests pass).

#### S-39: Quét vé sai suất diễn, vé đã huỷ hay mã lạ thì báo rõ lý do
- **Sprint:** 5 • **SP:** 2 • **Priority:** Should • **Wave:** A
- **Status:** **VERIFIED (Passed Gate A)**
- **Verified AC:**
  - Wrong showtime returns `WRONG_SHOWTIME` with showtime details.
  - Cancelled ticket returns `TICKET_CANCELLED` / `CANCELLED`.
  - Unrecognized code returns `UNKNOWN_TICKET`.
  - Specific reason logged for operational telemetry.
- **Evidence:** `apps/api/src/orders/admission-contract.spec.ts` (4/4 tests pass).

---

### Sprint 6

#### S-40: Hàng đợi phòng chờ khi lượng truy cập vượt ngưỡng
- **Sprint:** 6 • **SP:** 8 • **Priority:** Should • **Wave:** D
- **Status:** Ready for Wave D
- **Dependencies:** S-09, Wave C

#### S-41: Giới hạn tần suất yêu cầu theo tài khoản và theo IP
- **Sprint:** 6 • **SP:** 3 • **Priority:** Should • **Wave:** C
- **Status:** In Progress (Wave C)

#### S-42: Giới hạn số vé mỗi tài khoản được mua trong một suất
- **Sprint:** 6 • **SP:** 3 • **Priority:** Should • **Wave:** C
- **Status:** **VERIFIED (Holds Hot Path & Limit Contract)**
- **Verified AC:**
  - `parseTicketLimit` validates integer limits (1 to 2000) or null.
  - `loadLimit` caches showtime ticket limit with 10s TTL and singleflight protection against connection exhaustion.
  - Claim exceeding limit rejected with 403 `TICKET_LIMIT` without invoking SQL routine.
  - Claim exactly reaching limit permitted.
  - Consolidated `isDemo` check into cached `loadLimit` query to eliminate extra connection overhead on claim path.
- **Evidence:** `apps/api/src/holds/holds.service.spec.ts` (38/38 tests pass).

#### S-43: Giám sát và cảnh báo khi hệ thống quá tải
- **Sprint:** 6 • **SP:** 3 • **Priority:** Should • **Wave:** C
- **Status:** In Progress (Wave C)

#### S-44: Sơ đồ ghế tự cập nhật trạng thái mà không cần tải lại trang
- **Sprint:** 6 • **SP:** 3 • **Priority:** Could • **Wave:** C
- **Status:** In Progress (Wave C)

---

### Sprint 7

#### S-45: Người mua huỷ vé và nhận tiền hoàn tự động
- **Sprint:** 7 • **SP:** 5 • **Priority:** Could • **Wave:** E
- **Status:** Queued for Wave E

#### S-46: Ghế của vé đã huỷ tự động mở lại cho người khác mua
- **Sprint:** 7 • **SP:** 2 • **Priority:** Could • **Wave:** E
- **Status:** Queued for Wave E

#### S-47: Ban tổ chức huỷ suất diễn và hệ thống hoàn tiền hàng loạt
- **Sprint:** 7 • **SP:** 5 • **Priority:** Could • **Wave:** E
- **Status:** Queued for Wave E

#### S-48: Xử lý các trường hợp hoàn tiền bị lỗi hoặc chậm
- **Sprint:** 7 • **SP:** 3 • **Priority:** Could • **Wave:** E
- **Status:** Queued for Wave E

#### S-49: Nhật ký kiểm toán ghi lại mọi thay đổi quan trọng
- **Sprint:** 7 • **SP:** 3 • **Priority:** Should • **Wave:** C (Foundation) / G
- **Status:** Audit foundation underway in Wave C before refund workflows.

---

### Sprint 8

#### S-50: Báo cáo doanh thu theo sự kiện, suất diễn và loại vé
- **Sprint:** 8 • **SP:** 3 • **Priority:** Should • **Wave:** F
- **Status:** Queued for Wave F

#### S-51: Báo cáo tỉ lệ vào cổng theo thời gian thực và theo cửa
- **Sprint:** 8 • **SP:** 2 • **Priority:** Should • **Wave:** F
- **Status:** Queued for Wave F

#### S-52: Đối soát số liệu giữa ngân hàng, cổng thanh toán và hệ thống vé
- **Sprint:** 8 • **SP:** 3 • **Priority:** Could • **Wave:** F
- **Status:** Queued for Wave F

#### S-53: Tự động dọn dẹp hoặc ẩn danh hoá dữ liệu cá nhân theo định kỳ
- **Sprint:** 8 • **SP:** 3 • **Priority:** Could • **Wave:** G
- **Status:** Queued for Wave G

#### S-54: Người dùng đồng ý điều khoản và chính sách bảo mật khi đăng ký
- **Sprint:** 8 • **SP:** 1 • **Priority:** Must • **Wave:** G
- **Status:** Registration consent verified in `registration-form.spec.tsx` (5/5 pass).

#### S-55: Sao lưu dữ liệu định kỳ và quy trình khôi phục khi gặp sự cố
- **Sprint:** 8 • **SP:** 2 • **Priority:** Must • **Wave:** 0 (Baseline) / G
- **Status:** Baseline backup and trial restore verified in Wave 0. Full off-host schedule in Wave G.

---

## 3. Decisions & Limitations Tracking

| ID | Topic | Classification | Current State / Decision |
|---|---|---|---|
| **D-01** | Test Database Strategy | `[APPROVED]` | Isolated database `codegym_backup_verify` used for restore validation; `codegym_local` untouched and preserved. |
| **D-02** | Local Email Transport | `[APPROVED]` | Local mock / SMTP catcher pattern used; no real email credentials or public mail servers called in tests. |
| **D-03** | Ed25519 QR Signing Key | `[APPROVED]` | Local key generated/configured with persistent rotation support; no raw private keys committed. |
| **D-04** | Offline Concurrency Limitation | `[APPROVED]` | Disconnected offline devices cannot detect cross-device concurrent scans in real time; conflict detection is triggered server-side during synchronization. |
| **D-05** | Cancellation Deadline & Refund Rate | `[PROPOSED DEMO DEFAULT]` | Default 24h prior to showtime cutoff, 100% refund for cancelled showtimes, tiered refund for buyer cancellation. |
| **D-06** | Waiting Room Capacity & Threshold | `[PROPOSED DEMO DEFAULT]` | Configurable queue threshold (default 50 concurrent seat selectors), 10-minute hold lease. |
| **D-07** | Privacy Policy & Data Retention Policy | `[PROPOSED DEMO DEFAULT]` | 30-day anonymization window for inactive accounts, explicit consent checkbox on registration. |
| **D-08** | Statement Provider Reconciliation Format | `[PROPOSED DEMO DEFAULT]` | Normalized CSV format with standard transaction ID, amount, timestamp, and status columns. |
