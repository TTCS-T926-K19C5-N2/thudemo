# DEMO_HANDOFF — Codegym local demo (DEMO_PARTIAL)

## Cập nhật mới nhất — R76 (2026-10-23)

Trạng thái hiện tại vẫn là **DEMO_PARTIAL**. Profile cô lập đã được Restart bằng official launcher ở R65 khi đạt guard RAM; R65/R66 xác minh build đó READY, catalog và trang chi tiết desktop/mobile, dữ liệu 40 event/44 suất/5 đơn/5 vé còn nguyên. Sau R72 launcher báo source stale vì worker-password-reset vừa đổi; web/API/Mailpit cũ vẫn phản hồi nhưng chưa nạp cấu hình mới. Lần đo hiện tại chỉ có 1,29 GiB RAM trống, dưới guard Restart 2 GiB, nên chưa khởi động lại. R71 xác minh login/current-user/route/logout cho đủ 5 role giả. R72 bật worker chỉ trong launcher/profile Mailpit cô lập; unit core 13/13 PASS, runtime reset-mail test chưa chạy và chưa tạo token/email fixture. R60 fix đã được build và browser retest PASS trên R65: 409 SHOWTIME_CLOSED giữ đúng cảnh báo, không phát sinh hold. Full regression R70: API 481, web 168, deploy/laptop 20; không fail/skip; sau thay đổi launcher R72 chỉ chạy test tập trung. Còn 90 assertion Ready/Must chưa PASS nên chưa tuyên bố DEMO_READY. Các đợt R48–R59, quyền Organizer/Buyer, lockout, sơ đồ ghế, tranh chấp hold và phiên hết hạn có kết quả ở báo cáo evidence. R76 đo lại 1,29GiB RAM trống và xác nhận official Status vẫn stale; chưa restart, chưa tạo reset email. S-57-AC01 và INT-16.03 PASS; email transfer trong Mailpit còn BLOCKED, INT-16.01/02 chưa PASS. Còn 90 assertion Ready/Must chưa PASS. Evidence: `evidence/ai-remediation/20261023T162100-demo-local-completion/`.

Giữ 494 mã inventory gốc và 6 child assertions, tổng 500 source-derived rows: 162 PASS, 0 FAIL, 326 NOT_RUN, 6 BLOCKED, 5 NEEDS_DECISION, 1 MISSING. Có 21 ca bổ sung: 18 PASS và 3 BLOCKED; tổng `results.json` là 521 hàng (180 PASS, 0 FAIL, 326 NOT_RUN, 9 BLOCKED, 5 NEEDS_DECISION, 1 MISSING). R53/R57/R58/R59 chứng minh hold/release, thao tác mobile sau zoom, conflict giữa Buyer và thời hạn hold dùng chung. R54 xác minh phiên hết hạn. R60 tái hiện lỗi S-10-AC04; R65 đã build patch và browser retest PASS; R49 runtime logging vẫn BLOCKED; R69 PostgreSQL E2E harness S-15/S-16 cũng BLOCKED do Prisma schema engine lỗi trước khi chạy test (DB test riêng, không ảnh hưởng demo); R72 Mailpit reset-email retest BLOCKED chờ safe Restart. R76 S-57-AC01 and INT-16.03 PASS for recipient ticket/QR, old QR revoked, order privacy, unchanged amount/items, audit and durable transfer outbox; INT-16.01 remains NOT_RUN because SMTP receipt is part of its compound assertion, INT-16.04 is BLOCKED pending Mailpit after safe restart, and INT-16.02 broader lifecycle remains NOT_RUN. Focused API suites 44/44. RAM 1.29GiB; no safe restart. Còn 90 assertion Ready/Must chưa PASS; không tuyên bố DEMO_READY. Chi tiết hiện hành theo tier, priority và group ở `report.md` trong thư mục evidence trên.


## Source and result

- Source baseline: branch `feature/sprint-4-8-complete`, HEAD `ce777bd13e472c089eef4a3c1ed4455e501ae3ba`, with uncommitted working-tree changes preserved. No commit, push, merge, or deploy was made.
- Profile demo được cô lập khỏi DB/cache chính. Build R65 đã từng READY tại web `http://localhost:3000`, API `http://localhost:3001`, Mailpit `http://127.0.0.1:24931`; sau thay đổi cấu hình R72, official Status báo source stale. Lần đo RAM mới nhất là 1,67GiB, thấp hơn guard Restart 2GiB; cần người dùng giải phóng thêm RAM rồi mới chạy Restart và xác minh Status.
- Latest read-only R47 snapshot: 40 events, 44 showtimes, 5 orders and 5 tickets. Earlier R43 snapshot was 40 events, 42 showtimes, 2 orders and 2 tickets. Demo DB is retained across restart.
- Bàn giao vẫn là **DEMO_PARTIAL**, không phải DEMO_READY. DB demo giữ 40 event/44 showtime và 5 order/5 ticket theo snapshot read-only; endpoint hiện có thể phản hồi từ tiến trình cũ nhưng profile chưa READY theo source R72. Chưa có bằng chứng clean GitHub clone hoặc walkthrough đủ hành động của năm vai trò.

## Functions and local evidence

| Function | Local result |
|---|---|
| Public catalog and event detail | Verified on desktop/mobile. Catalog browser returned 43 results on R46; PostgreSQL contains 44 showtime rows; scrolling now appends pages. A public ON_SALE rehearsal detail shows schedule, venue, price and seat-selection link. |
| Five demo roles | On the clean exact-file copy, Admin, Organizer, Buyer, Staff and Accountant signed in. Admin users, Organizer events, Staff scanner and Accountant operations routes loaded. Organizer events page and existing Bệnh sĩ detail were checked read-only; list showed 40 events/42 showtimes and 40 published. A run-bound draft-creation UI+DB test passed on desktop and 390×844 mobile (no horizontal overflow); both exact fixtures were removed. Organizer created a run-bound draft and added a future showtime through desktop/mobile UI; the fixture was cleaned. R38 Organizer A was denied access to Organizer B’s event on desktop (raw HTTP inferred from the UI 403 branch); R39 desktop past-time input was rejected with a clear message; R40 desktop duplicate-time showtime was saved with the required warning. The source matrix still has mobile child assertions BLOCKED for these checks; the earlier desktop evidence does not prove the mobile outcomes, so they remain unverified. Full edit, seat-map/pricing, publication and role-permission actions remain incomplete. |
| Seat map / hold / order / payment | Buyer completed UI flow on D-1 STANDARD: server-confirmed 10-minute hold, one order at 380,000₫, mock gateway success, PAID result. Independent read-only PostgreSQL confirms exact amount, one successful payment, SOLD seat, released hold and one VALID ticket. Atomicity under interruption remains unproven. |
| Mock payment / order / ticket | The full local Buyer happy path was walked; one demo order and QR ticket are now durable. Refund/mismatch/duplicate-webhook and other negative scenarios remain incomplete. |
| Coupon, waitlist, transfer, scanner/offline, operations | Partial evidence exists in this run folder and `bugs.md`; coverage is incomplete. Staff scanner rejected a synthetic unknown QR on desktop/mobile; PostgreSQL confirmed no admission side effect. Valid check-in and delayed-response UI remain unverified. |
| Registration / ticket email | Synthetic registration and ticket email were routed only to Mailpit. The Buyer resend action returned the existing ticket; the catcher showed matching D-1 QR mail within seconds. No Internet email/Inbox claim. |

Catalog evidence: `evidence/ai-remediation/20261023T132000-demo-handoff/event-catalog-browser-verification.json`, `event-catalog-api-oracle.json`, `demo-state-after-catalog-fix.json`, and `catalog-search-filter-ui-verification.json`. R32 browser check: search returned 3 Bệnh sĩ showtimes; Kịch Nói filter returned 4 after clearing search; a no-match query showed an explicit empty state and clear-filter action restored 42 results. The UI was returned to its unfiltered state. Prior visual references and source asset maps are in `demo-ui-assets-manifest.json` and existing PNG evidence in the same evidence tree. The latest catalog screenshots were observed in the browser but not saved as files.

## Catalog content and assets

- Seed source: `demo-data/catalog.source.json`. The import maps event descriptions, original/reference schedules, poster and venue data. Poster/banner/font files are in `apps/web/public/images/` and the checked source asset manifest.
- Reference schedules are clearly marked as simulated/read-only. The separate Bệnh sĩ rehearsal showtime (07/12/2026) is marked for sale through the normal guarded demo path; the 23/10 schedule is time-sensitive and may already be past when this guide is used.
- Public sample detail observed: Bệnh sĩ at Nhà hát Kịch Việt Nam. The original description and artwork are retained. See the browser evidence and `demo-catalog-source-audit.json` for source-to-render checks.
- Existing records were not replaced by a generic seed. Fresh-clone initialization uses the guarded local onboarding script described below.

## Install, start, stop, restart and data initialization

Prerequisites: Windows PowerShell, Git, Node.js 24.21.0, pnpm 10.15.1 and Docker Desktop using its Linux engine. Run from a fresh clone's repository root:

```powershell
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Start
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Status
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Restart
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Stop
```

Wait for the `READY` line before opening the printed URLs. `Start` creates/uses `.sprint1-demo/`, applies repository migrations and runs the guarded, idempotent demo seed/catalog preparation. `Restart`/`Stop` preserve the demo profile's DB, Redis, Mailpit state and credentials. Do not use `pnpm seed:real`, copy the root `.env`, run `prisma migrate reset`, or point these commands at the primary DB. No separate manual import is needed for the supported fresh-clone path.

## Demo accounts and email

- The five synthetic accounts (Buyer, Organizer, Admin, Staff, Accountant) are generated for the local demo. The launcher prints the private local credential file path: `.sprint1-demo/config.json`.
- Read credentials only on the local demo machine. That file is Git-ignored; do not copy it to the repo, screenshots, terminal logs or this document. Never reuse a real password.
- Mailpit is the only email recipient. Open the URL printed by the launcher to inspect activation/ticket messages. A Mailpit acceptance does not mean Internet email or Inbox delivery.
- Payment and refund provider behavior for the demo is mock/local only; no real charge or external provider request is made.

## Suggested demonstration path

1. Start the isolated demo and open the public catalog. Confirm the event artwork, source content and reference-vs-sale labels.
2. Sign in using the local Buyer credentials. Open Bệnh sĩ and choose the 07/12/2026 on-sale rehearsal schedule. Select an available seat and follow the order and mock-payment path. The UI should keep the payable amount, hold and ticket state consistent.
3. Open the buyer's order/ticket view and verify the durable ticket; use Mailpit only if inspecting the local receipt.
4. Sign in as Staff, open the assigned rehearsal showtime/gate, download the ticket snapshot, then exercise offline queue and reconciliation using browser network simulation. Do not represent this as physical camera/4G proof.
5. Use the Admin/Organizer/Accountant local accounts for the representative management and operations screens. Role smoke does not imply all administrative workflows were accepted.

## Prepared package proof

- Primary prepared tree: `D:\Merge_2\Codegym-demo-proof-20261023T1530`. Clean-copy proof: `D:\Merge_2\Codegym-clean-package-proof-20261023T1544`. Copied the exact 1,049 selected source/package files; all SHA-256 values matched. The clean copy installed, migrated, guarded-seeded and built; UI showed 40 events/42 showtimes and artwork. Five roles signed in; Buyer completed A-1 VIP mock checkout; independent PostgreSQL and browser verification confirmed the ticket survived Restart. The secondary profile was stopped safely; its database volume and credentials remain in the ignored local folder. Proof: `evidence/ai-remediation/20261023T132000-demo-handoff/clean-package-copy-proof.json`, `clean-package-browser-verification.json`, `clean-package-order-oracle.json`.
- The proof tree was prepared from the current working tree, including uncommitted source/docs, rather than an old HEAD-only clone. It is not yet a new GitHub clone/remote checkout. No remote operation has been performed.
- The repository contains source, lockfile/shared package, migrations, demo dataset, image/font assets and `.env.example`. Private `.env`, local `.sprint1-demo/config.json`, database volumes, customer PII and DB dumps are not package inputs.
- Earlier exact-file R43 proof passed API 481 tests, web 163 tests and 20 laptop/deployment checks. Latest R47 current-source regression passed API 481, web 168 and deployment/laptop 20; zero failures/skips. The raw log and summary are in `evidence/ai-remediation/20261023T132000-demo-handoff/`. A fresh Git clone/remote checkout is not verified. Older README acceptance text remains historical and is explicitly superseded by this handoff section.

## Open decisions and limits

- `S-08-AC02` is NEEDS_DECISION: source AC hides draft/closed direct details/maps, while demo scope preserves read-only reference schedules. Current reference detail exposes a reference-map link but explicitly disables booking. Evidence: `s08-ac02-demo-reference-decision.json`.
- Other unrefined NEEDS_DECISION rows remain `S-40-NFR`, `S-48-NFR`, `S-62-NFR`, and `S-63-NFR`. Do not invent production thresholds or policies.
- At R43 the matrix has 494 rows: 142 PASS, 336 NOT_RUN, 10 BLOCKED, 5 NEEDS_DECISION, 1 MISSING, 0 FAIL. Three new Organizer checks have desktop evidence but mobile subcases remain BLOCKED. S-18-AC02 atomicity and multi-page order-history navigation remain NOT_RUN. BUG-R40-01 (P3) was fixed in R42; the quick preset clears stale validation. Focused component test passed 8/8, prepared and clean exact-file web builds passed, and the active local demo UI retest passed. R43 final regression passed on the updated exact-file source: API 481, web 163, laptop/deploy 20; typecheck and monorepo build passed; lint exited 0 with warnings. See report.md and bugs.md in the evidence folder.
- The registration privacy notice currently names staging and a dated retention window; this profile is local. Consent testing was limited to synthetic local data routed to Mailpit. Keep that copy out of real-user flows until the notice is reviewed; it was not rewritten in this handoff.
- No staging, hosted CI, real payment provider sandbox, Internet email/Inbox, physical camera, physical 4G or off-host production backup was tested. These do not block local demo; their original cases remain BLOCKED/NOT_RUN rather than being marked PASS.











