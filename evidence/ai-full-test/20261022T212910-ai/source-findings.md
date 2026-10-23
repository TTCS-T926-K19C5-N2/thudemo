# Findings (read-only source/runtime)

- `apps/api/src/app.module.ts` omits `CoreCompletionModule` from imports.
- `apps/api/src/events/events.controller.ts` exposes `PATCH /events/:id` but no `PATCH /events/:id/publication`.
- `apps/web/src/features/core/{publication-control,reschedule-form,mail-failures}.tsx` have no page usage; publication/reschedule appear only in component tests in `core-ui.spec.tsx`.
- No matching implementation terms/routes/components found for S-56 coupon, S-59 waitlist, S-60 sold-seat PDF, S-62 attendance export, or S-63 abandoned-cart/hold analytics in `apps/api` and relevant `apps/web/src` trees. Static MISSING, not runtime exercise.
- Browser at `http://127.0.0.1:3000/` showed catalog transition from loading to “Không tải được danh sách / Dịch vụ chưa sẵn sàng”; API port 3001 had no listener. This runtime's source revision is not verified (Next dev indicator); not evidence from a fresh full-project build.
- Browser read-only UI observation of `/forgot-password` showed email field and “Gửi hướng dẫn”. API core module remains unmounted, so UI wrapper presence does not establish working reset flow.
- `docker ps` showed a `thudemo-postgres-1` container with `thudemo`, `codegym_local`, and several existing test DBs. The existing E2E launcher creates a database inside that shared container, selects Redis DB 15 without verifying it unused, and writes fixed-date logs. No isolated PostgreSQL/Redis/SMTP catcher profile was established; no integration writes were made.

Decision evidence reviewed (read-only): `docs/K01_EVIDENCE.md` records DEC-17 acceptance of timebox/mentor deviation without retrospective compliance; K-01 is still explicitly not Done and prior benchmark is historical evidence, not a fresh run. `docs/REVIEW_POLICY.md` / `evidence/sprint1/20261017-review-policy/decision-18.md` record approval of DEC-18; current GitHub required-check and branch-protection enforcement readback was not available in this local task, so the exception was not applied as acceptance proof.
