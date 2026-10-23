# Source route and feature inventory

Source/build output only; runtime integration is not inferred from file presence.

## Web routes in fresh `pnpm build`

`/`, `/account`, `/account/privacy`, `/account/tickets`, `/activate`, `/admin/users`, `/api/[...path]`, `/check-in`, `/events`, `/events/[id]`, `/events/new`, `/forgot-password`, `/login`, `/mock-gateway/pay`, `/operations`, `/orders`, `/orders/[id]`, `/payment/result`, `/payment/result/[orderId]`, `/privacy`, `/register`, `/resend-activation`, `/reset-password`, `/scanner`, `/scanner/reports/[showtimeId]`, `/scanner/snapshot`, `/shows/[id]`, `/shows/[id]/seats`, `/showtimes/[id]/[mode]`, plus framework `/_not-found`.

`/api/[...path]` is an additional proxy route beyond the page inventory in PLAN §15. Fresh Next build produced route output and served web-only on port 3410. Its home catalog transitions loading → service-unavailable because API 3001 has no listener.

## Mounted API module/controller families (source inspection)

AppModule imports Prisma, Redis, Auth, Users, Events, Showtimes, Holds, Orders, Payments, Monitoring, CheckIn S29, Tickets, Scanner, BookingAccess, Lifecycle and LocalDashboard modules. Controller families found under `apps/api/src`: app/health, auth, users/admin-users, events, showtimes, holds and legacy seat-hold, orders, ticket QR/check-in, payments/mock gateway, check-in S29, tickets, scanner. Exact route decorators are present in source; behavior/guards/ownership were not invoked against a fresh API.

## Unmounted or absent integrations

- `CoreCompletionModule` exists under `apps/api/src/core-completion/core.module.ts` but is absent from `AppModule.imports`; its reset/reschedule/mail-administration handlers are not mounted through the shown app graph.
- `EventsController` exposes `PATCH /events/:id`; it has no `PATCH /events/:id/publication` handler.
- Web components `PublicationControl`, `RescheduleForm`, `MailFailures` are defined but search found no page usage; they are imported in `core-ui.spec.tsx` tests only.
- Backlog features S-56 coupon, S-59 waitlist, S-60 sold-seat PDF, S-62 attendance export, S-63 cart/hold analytics not located in source search; see each MISSING case.
- Implemented/proposed additional routes in the PLAN inventory: password reset/forgot, publication/hidden, reschedule and mail failure administration. Source implementation is not runtime functionality until mounted and reachable.
