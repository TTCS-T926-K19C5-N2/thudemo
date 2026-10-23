# Antigravity IDE implementation prompt — S-45

Copy everything below into the AI chat in Antigravity IDE with the current Codegym folder open.

---

You are working on my existing event ticketing application. Complete story **S-45: A buyer cancels before the deadline and receives a refund according to the approved policy**. Inspect the current files first, then implement and verify the missing behavior. Do not rebuild an existing working feature or merely provide a plan.

## 1. Workspace and scope

The application root inspected when this prompt was prepared is `D:\Merge_2\Codegym`. If I opened the same project elsewhere, resolve the root from its workspace manifests. Sibling folders `Merge\Codegym` and `thudemo` are reference projects, not the implementation target.

Read `AGENTS.md`, the backlog CSV at `D:\Merge_2\Bán vé sự kiện có sơ đồ ghế.xlsx - Backlog.csv` (S-45 and its direct dependencies), and relevant current documentation. The AGENTS file contains a historical `thudemo/` root name: verify the actual open workspace rather than editing the sibling project. Resolve referenced documentation where it actually exists; report missing files or unavailable skills without fabricating their contents.

The repository has recently changed. Paths and findings below are starting points, not a substitute for rereading the source. Record HEAD, branch, and `git status --short`. Preserve tracked and untracked work, including `core-completion`, password recovery, publication, rescheduling, and restored visual styles. Do not assume untracked files are disposable.

### Approved business decision — authoritative for this task

The owner has explicitly approved this local/sandbox policy:

- Cancel the **whole paid order**, not individual tickets.
- Allow buyer cancellation when the show starts **at least 24 hours after server time**, including the exact 24-hour boundary.
- Refund **100% of the confirmed paid order amount**.
- No ticket in that order may already have an admission/check-in.
- Release the seats immediately when cancellation commits.
- Use the existing **mock refund gateway**. No real money is transferred.

The old `huong-dan-antigravity.md` suggests per-ticket cancellation and configurable refund tiers. Those suggestions are superseded by the approved decision above for this delivery. Do not add partial cancellation, 72h/50% tiers, real payment integrations, or policy administration. Explain this distinction in the handover.

S-46, S-47, S-48 and S-53 already have related code. Preserve their behavior and verify the direct interactions needed by S-45; do not expand them into separate projects.

## 2. Current architecture and existing implementation

Inspect the installed versions and scripts in the current manifests. At prompt preparation this is a pnpm workspace, Node 24, NestJS API, Prisma/PostgreSQL, Redis, Next.js App Router, React, Tailwind, existing shadcn-style primitives, and Vitest.

Important existing files:

- `apps/api/src/lifecycle/cancellations.service.ts`: policy constant `DEMO_CANCELLATION_POLICY`, `assertCancellationWindow`, preview, transaction-based cancellation, refund processing and related show-cancellation behavior.
- `apps/api/src/lifecycle/lifecycle.module.ts`: `LifecycleController`, `LifecycleWorker`, guards, routes and module wiring. There is currently no separate `lifecycle.controller.ts` file.
- `apps/api/src/lifecycle/mock-refund.gateway.ts`: refund adapter and deterministic mock references.
- `apps/api/src/lifecycle/lifecycle.spec.ts`: policy and gateway unit tests.
- `apps/api/src/lifecycle/reports.service.ts`: financial reporting.
- `apps/api/prisma/schema.prisma` and existing migration SQL: `Order`, `OrderItem`, `Ticket`, `Payment`, `Refund`, `RefundAttempt`, `DomainAudit`, admissions and related outboxes.
- `apps/api/src/orders/ticket-check-in.service.ts`, `ticket-qr.service.ts`, `admission-policy.ts`.
- `apps/api/src/scanner/scanner.service.ts` and `offline-admissions.service.ts`.
- `apps/api/src/showtimes/seat-events.service.ts` and existing seat hold/payment locking paths.
- `apps/api/src/core-completion/`: reminder/reschedule mail behavior, if still present; cancellation must invalidate obsolete queued notices.
- `apps/web/src/features/lifecycle/order-cancellation.tsx`: existing cancellation section and polling.
- `apps/web/src/features/order-review/order-review.tsx`: currently embeds `OrderCancellation` for PAID/CANCELLED orders.
- `apps/web/src/features/orders/order-history.tsx` and current ticket-list components.
- `apps/web/src/lib/api/client.ts`, `src/lib/contracts/`, formatting helpers and `src/components/ui/`.
- `apps/web/src/app/globals.css`, `product.css`, `theater-theme.css`, `layout.tsx`: restored cream/burgundy design; preserve it.
- `apps/api/scripts/verify-sprint6-8.mjs`, `run-isolated-e2e.mjs` and `verify-core-completion.mjs`: inspect their safety assumptions before reuse.

Existing API contracts to preserve:

```text
GET  /orders/:id/cancellation   buyer preview
POST /orders/:id/cancel         buyer cancellation
GET  /operations/refunds        existing operational list
```

Current preview includes `policy`, `orderId`, `amount`, `eligible`, `unavailable`, and `refund`. Current cancellation returns `{ refund, message }`. `Refund.orderId` is unique; refund states include QUEUED, SENDING, SUCCEEDED, FAILED and UNKNOWN. The worker uses leases, retry attempts and mock gateway IDs. Extend existing contracts additively when needed; do not invent a parallel ticket/refund subsystem.

## 3. Discovery and gap analysis

Before editing, create a concise table: requirement, current implementation evidence, verified gap, planned files. Distinguish source inspection from actual test results. Existing code is not proof of completion.

Specifically inspect these potential gaps without assuming they are confirmed bugs:

1. Preview and mutation eligibility may differ: preview checks for successful mock payments, while mutation also checks that they cover the total. Centralize consistent policy evaluation where practical.
2. Check-in may be represented by `OrderItem.checkedInAt`, ticket admissions, or legacy Ticket fields. Find every authoritative representation and reject cancellation after any actual entry.
3. Ticket ownership can change. Verify existing transfer/ownership semantics; never let cancellation refund a transferred ticket while taking it away from its current owner. Unless a different approved rule exists, reject whole-order buyer cancellation when any ticket has been transferred away, with a clear reason. Do not refund a different account automatically.
4. Free orders must not generate a zero-value gateway operation. If the existing payment model supports free paid orders, cancel them safely with amount zero and a truthful “no refund required” result. Do not introduce a new free-ticket purchase flow.
5. QR identity exists in canonical OrderItem/admission paths and potentially legacy Ticket rows. Cancellation must invalidate both relevant paths even when a legacy row is absent.
6. Confirm `app.actor_id` actually produces the required audit through existing triggers. Do not create duplicate audit entries by adding an unconditional second mechanism.

## 4. Required server behavior

### Preview

- Require authenticated authorized access and order ownership; enforce on the server, not only through UI visibility.
- Return a stable, typed response with eligibility, human-readable Vietnamese reason, policy version, current scheduled start, cancellation deadline, refund amount in integer VND, refund percentage, and existing refund state where applicable.
- Calculate from authoritative server/database time and the current schedule. Store timestamps consistently; display Asia/Ho_Chi_Minh in the UI.
- Expired, unpaid, pending, already used, transferred, unsupported provider and disabled-account cases must not appear cancellable.
- A cancelled order should display the existing result/status rather than present another cancellation action.
- Do not expose another customer's order details or gateway secrets.

### Cancellation transaction

- Preserve the current authentication/session/role/CSRF protections.
- Validate UUID input with existing conventions.
- Recheck ownership, payment, schedule and admission state under appropriate locks; a preview is never permission to skip validation.
- Examine the lock order used by check-in, rescheduling, payments and seat holds. Make concurrent cancellation/check-in safe with a shared locking strategy, not a read-before-write check. Avoid deadlocks.
- In one database transaction: cancel the order, invalidate its tickets, release only seats still belonging to this cancelled allocation, cancel obsolete pending notification jobs where applicable, create the durable refund intent, and record audit through the existing mechanism.
- Keep original payments, order items, ticket identity, QR signatures and financial history. Do not delete/reissue tickets or rotate signing keys.
- Use the current unique order refund constraint and stable refund ID for gateway idempotency. Double clicks, concurrent requests, worker restarts and retries must not issue two refunds.
- Return a consistent response envelope for initial success and repeated requests; do not leak an unhandled unique-constraint exception.
- Keep external gateway calls outside the cancellation transaction. Commit the durable intent first; use the existing worker to process it.
- Release seats on cancellation, even while the mock refund is QUEUED/FAILED. An old retry must never release a seat that has since been sold to someone else.
- Publish seat/cache invalidation only after successful commit using the existing mechanism.
- Reject real-provider payments explicitly. Do not label a mock refund as a real bank refund.

### Refund processing

- Reuse `MockRefundGateway`, worker leases, fencing and attempt history.
- Preserve at most three automatic attempts and increasing backoff unless current approved documentation specifies otherwise.
- Only mark SUCCEEDED after a successful gateway result. Represent FAILED/UNKNOWN truthfully; do not silently turn an uncertain result into success.
- Handle thrown gateway errors/timeouts, exhausted leases and process restarts without losing the durable job or creating duplicate refunds.
- Preserve existing operational access and reports; a cancelled order is not proof that money has already been refunded. Gross original payments remain; successful refunds affect net revenue appropriately.
- Do not enable new background work against historical live orders merely to demonstrate this story.

## 5. UI completion in the existing design

Reuse `OrderCancellation` and the existing order/ticket navigation. Keep the restored burgundy/cream typography, layout, homepage, registration and login unchanged.

- Make cancellation discoverable from the buyer's existing ticket/order pages. Use “Huỷ toàn bộ đơn” where multiple tickets are involved; never imply per-ticket cancellation.
- Show the show name, current start time, deadline, paid amount, refund rate and exact expected refund amount before confirmation.
- Use the installed dialog primitives if a confirmation dialog is needed. Explicit confirmation must state that every ticket in the order becomes invalid and the seats return to sale.
- Prevent double submission and provide loading, eligible, ineligible, validation/error, cancelled and refund-progress states.
- Translate machine states into Vietnamese: QUEUED/SENDING → “Đang xử lý”, SUCCEEDED → “Đã hoàn tiền giả lập”, FAILED → “Hoàn tiền lỗi”, UNKNOWN → “Chưa xác định kết quả — cần kiểm tra”. Explain that no real transfer occurs.
- Do not claim “sẽ thử lại” after all retries are exhausted.
- Replace unsafe type assertions with a runtime decoder following `src/lib/contracts` conventions. Reject malformed server data gracefully.
- Refresh the relevant order/ticket state after cancellation. Poll only while processing, stop on terminal states, clean up requests/timers on unmount and allow recovery from a transient load error.
- Keep keyboard/focus behavior, readable contrast, accessible feedback, and mobile layout consistent with existing components.

## 6. Protect data and environments

- Preserve the existing 40-event dataset and all current user/order/seat records. Record actual baseline counts; do not force the count back to 40 by deleting new legitimate records.
- Back up the local database before any migration; never print database credentials.
- No `prisma migrate reset`, `prisma db push`, reseeding, destructive cleanup, editing applied migrations, Git reset/clean, overwriting `.env`, or rotating secrets/QR keys.
- Use an additive migration only if a demonstrated gap requires schema changes. Test it against a copy of the current populated database.
- Use a separate disposable test database and Redis namespace/database. Inspect destructive tests before running them. Do not run raw E2E commands with the live DATABASE_URL.
- Use an SMTP catcher or disabled mail workers for tests. Account for registration, ticket, notification, password reset and lifecycle mail workers; inspect current flags rather than assuming one flag stops every sender.
- Keep existing ports/processes available. Run isolated verification services on separate ports when necessary.
- Do not commit, push, merge, publicly deploy or alter remote settings.

## 7. Mandatory tests and evidence

Add missing unit, API integration and UI tests using the current tooling. Use real database transactions for concurrency tests; mocks alone cannot prove locking correctness.

Cover at least:

1. Eligible paid mock order: preview 100%, correct amount/deadline; cancellation invalidates all tickets, releases seats and creates exactly one refund.
2. Exact 24h boundary allowed; one millisecond after cutoff denied with a clear reason and no mutations.
3. Unauthenticated/non-owner attempts denied without leaking private order data.
4. Unpaid/expired/non-mock/insufficient confirmed payment rejected consistently by preview and mutation.
5. Checked-in order rejected through each real admission representation, including canonical records.
6. Concurrent check-in versus cancellation: only one logically valid outcome; no admitted-and-refunded ticket.
7. Repeated cancellation, parallel tabs and concurrent API calls: one refund, stable response and no double release.
8. Seat can be purchased again; replaying the old cancellation/refund job cannot free the new buyer's seat.
9. Rescheduling changes the cancellation deadline consistently; cancellation/reschedule races use the current committed schedule.
10. Gateway failure then recovery, three-attempt exhaustion, worker restart and lease recovery; attempts and final states remain truthful.
11. Cancelled QR rejected online and included in scanner change data. After offline data synchronization, it is rejected offline. Explicitly acknowledge that a fully disconnected stale device cannot instantly learn a cancellation; reconciliation must reject/log the obsolete admission according to existing rules.
12. Transferred tickets handled without revoking another owner's rights; test the approved behavior.
13. Free paid order, if supported: no zero-value gateway request.
14. Reports retain original financial records and count successful refunds without double subtraction.
15. UI confirmation, amount/deadline, disabled and error states, progress polling/cleanup and terminal status translations.
16. Regression smoke: login, booking/hold, mock payment, ticket issuance, scanning and existing organizer cancellation.

Inspect current manifests before selecting commands. Normally run `pnpm typecheck`, `pnpm lint`, `pnpm build`, relevant API/web Vitest tests, then relevant E2E through a verified isolated runner. Existing scripts may contain machine-specific Docker/container or evidence-directory assumptions: fix or configure those safely before use. Do not report a pass if a test was skipped or the service never started.

Verify the actual UI in a browser at desktop and mobile sizes, including confirmation and a full sandbox cancellation/refund journey using synthetic records. If browser access is blocked, report that limitation and provide exact manual steps; never claim visual verification from an HTTP 200 alone.

## 8. Execution and handover

Work in this order: inspect → gap table → targeted changes → isolated tests → browser verification → handover. Keep unrelated changes intact. Do not stop after generating a checklist when implementation is possible.

Create `docs/S45_ACCEPTANCE_REPORT.md` containing:

- Approved whole-order/24h/100%/mock scope and the older guide conflict.
- What already existed, what you actually changed, and file paths.
- API examples with synthetic IDs, response meanings, eligibility and error codes.
- Schema/migration and data-preservation evidence, if applicable.
- Commands run, test counts, failure details, and browser screenshots/results separated from automated tests.
- A step-by-step Vietnamese demo: sign in as synthetic buyer → open paid order → preview → confirm → view cancelled tickets → observe queued/succeeded mock refund → verify seat availability → reject old QR → inspect report.
- Worker configuration and how to test a temporary mock failure without changing live settings.
- Any remaining limitations or policy questions; no invented production/sandbox-provider claims.
- Safe rollback of changed application files/configuration; never reset the database or erase refund/audit history.

Definition of done: S-45 works end to end under the approved demo policy, concurrency and refund idempotency are demonstrated, the existing design/data/features are preserved, and every unverified acceptance item is explicitly disclosed.
