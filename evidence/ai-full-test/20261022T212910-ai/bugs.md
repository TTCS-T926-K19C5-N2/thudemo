# Bugs and gaps (run 20261022T212910-ai)

## BUG-01 — Fresh API build fails

- Severity: P1
- Requirement/case: INT-12 (fresh source verification), GOV-03 (local build evidence)
- Fixture: Current working tree source; no DB/data fixture needed.
- Reproduction: From `D:\Merge_2\Codegym`, run `pnpm build` or `pnpm typecheck`.
- Expected: API compiles/typechecks so the current source can be launched for route and full-stack tests.
- Actual: API compile stops in `apps/api/src/core-completion/core.service.ts` because `decryptActivation` is imported from `activation-delivery.service.js`, where no such export exists. Typecheck additionally finds `EventsService.publication` missing in the untracked publication spec.
- Evidence: `build.log`, `typecheck.log`; exit codes 1 and 2.

## BUG-02 — Core completion/publication not connected to running API/UI

- Severity: P1
- Requirement/case: INT-12, EXT-RESET-01/02, EXT-PUBLISH-01, EXT-RESCHEDULE-01, EXT-MAIL-01
- Fixture: Static route/module inventory; runtime API unavailable due BUG-01.
- Reproduction: Inspect `apps/api/src/app.module.ts` imports; `apps/api/src/events/events.controller.ts`; search web source for usages of the core UI controls.
- Expected: Reset, publication, reschedule and mail admin routes are mounted, and matching user controls are reachable from pages.
- Actual: `CoreCompletionModule` is not imported by AppModule. EventsController has `PATCH :id` but no `PATCH :id/publication`. `PublicationControl`, `RescheduleForm` and `MailFailures` have no page usage. Runtime HTTP was not attempted because API could not build.
- Evidence: `source-findings.md`, `source-route-inventory.md`, `apps/api/src/app.module.ts`, `apps/api/src/events/events.controller.ts`.

## GAP-56 — Event coupons absent (Later/Could)

- Severity: P2; backlog status: Later, not independently a release gate
- Requirement/case: S-56-AC01, S-56-NFR
- Fixture: Source search across API and relevant web source.
- Reproduction: Inspect coupon/discount routes, schema and UI; none found in source scope.
- Expected: Event coupon creation/redemption per baseline.
- Actual: No implementation located; no runtime test possible.
- Evidence: `source-findings.md`.

## GAP-59 — Waitlist absent (Later/Could)

- Severity: P2; backlog status: Later, not independently a release gate
- Requirement/case: S-59-AC01, S-59-NFR
- Fixture: Source search across API and relevant web source.
- Reproduction: Inspect waitlist UI/API/schema; no dedicated waitlist found. Waiting room S-40 is separate.
- Expected: Waitlist registration and FIFO notification per baseline.
- Actual: No implementation located; no runtime test possible.
- Evidence: `source-findings.md`.

## GAP-60 — Sold-seat PDF export absent (Later/Could)

- Severity: P2; backlog status: Later, not independently a release gate
- Requirement/case: S-60-AC01, S-60-NFR
- Fixture: Source search across API and relevant web source.
- Reproduction: Inspect a route/UI for sold-seat PDF export; none found.
- Expected: One-page PDF with seat status/legend.
- Actual: No implementation located; no runtime test possible.
- Evidence: `source-findings.md`.

## GAP-62 — Attendance CSV export absent (Later/Could)

- Severity: P2; backlog status: Later, not independently a release gate
- Requirement/case: S-62-AC01, S-62-NFR
- Fixture: Source search across API and relevant web source.
- Reproduction: Inspect an attendance CSV export route/UI; none found.
- Expected: Attendance CSV fields per baseline, subject to PII decision.
- Actual: No export implementation located; no runtime test possible.
- Evidence: `source-findings.md`.

## GAP-63 — Abandoned-cart/hold duration report absent (Later/Could)

- Severity: P2; backlog status: Later, not independently a release gate
- Requirement/case: S-63-AC01, S-63-NFR
- Fixture: Source search across API and relevant web source.
- Reproduction: Inspect event analytics routes/components for hold-to-order and abandonment reporting; none found.
- Expected: Per-showtime hold/order/expiry counts and duration mean/p90.
- Actual: No implementation located; no runtime test possible.
- Evidence: `source-findings.md`.

## Unit-suite observations (not promoted to product bugs)

API unit suite: 425 passed, 12 failed / 437 across 53 files. Failures: 5 publication specs (`publication` method absent), 3 reset proxy path checks, 1 reminder expectation, 1 AppController setup hook timeout, and 2 delivery retry backoff upper-bound assertions. The two retry failures exceeded the configured upper bound by 472 ms and 640 ms; rerun required before classifying as flaky or product behavior. Web and deploy suites pass independently. No failures were dropped.
