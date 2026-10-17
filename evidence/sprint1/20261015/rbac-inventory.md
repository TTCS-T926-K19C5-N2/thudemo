# API protection inventory — source81d1dd9 + local fix

Global SessionAuthGuard then RolesGuard; no declared roles means authenticated403. Missing/expired session401 is checked first. `@Public` skips both intentionally; handlers must apply their own non-session contract where needed. No generic ADMIN bypass. Roles are OR semantics; ownership remains a service check.

| Method/route | Policy | Additional boundary / validation |
|---|---|---|
| GET / | Default deny | Authenticated403, anonymous401; regression exercised |
| GET /health | Explicit public method | Real PG SELECT1 + Redis ping, bounded503 |
| POST /auth/login | Explicit public method | Account/IP Redis budgets; signed proxy peer or direct socket; generic error; no secret logs |
| GET /auth/me | Five named roles | Active server session/current DB roles |
| POST /auth/logout | Five named roles | Revokes tokenHash session; origin policy |
| GET /auth/organizer-only | ORGANIZER | Current roles every request |
| POST /events | ORGANIZER | Input parsed, owner=request.user.id, DRAFT |
| GET /events | Explicit public method | PUBLISHED events only |
| GET /events/mine | ORGANIZER | Filter by current organizerId |
| GET /events/:id/manage | ORGANIZER | findOwned owner403 |
| PATCH /events/:id | ORGANIZER | findOwned + field validation |
| POST /events/:id/showtimes | ORGANIZER | findOwned + future/zoned time; duplicate warning still save |
| GET /events/:id | Explicit public method | Published only; draft404 |
| POST /users/register | Explicit public method | Existing registration behavior; regression, not Sprint1 scope acceptance |
| GET /users/activate | Explicit public method | Token shape/expiry/single consumption; regression |
| POST /users/resend-activation | Explicit public method | Existing generic response; regression |
| GET /showtimes | Explicit public method | Public ON_SALE catalog contract |
| POST /showtimes/validate-map | ORGANIZER | Map validation |
| GET /showtimes/:id/manage | ORGANIZER | Event owner |
| POST /showtimes/:id/seat-map | ORGANIZER | Owner/state/atomic import |
| PATCH /showtimes/:id/prices | ORGANIZER | Owner/prices/state |
| PATCH /showtimes/:id/status | ORGANIZER | Owner/state/price readiness |
| GET /showtimes/:id/seats | Explicit public method | Public-sale/expired hold rules |
| GET /showtimes/:id/manage/seats | ORGANIZER | Owner |
| GET /showtimes/:id | Explicit public method | Public-sale contract |
| POST /showtimes/:id/holds | Class BUYER | Product claim/session/ownership, not prototype |
| GET /showtimes/:id/holds | Class BUYER | Own active hold |
| POST /showtimes/:id/orders | Class BUYER | Server price/hold transaction |
| POST /orders | Method BUYER | Existing order contract |
| GET /orders/me | Method BUYER | Own paginated history |
| GET /orders/:id | Method BUYER | Owner/status |
| GET /orders/:id/status | Method BUYER | Owner/status |
| GET /orders/:id/tickets | Class BUYER | Owner/paid/signed QR |
| POST /orders/:id/pay | Method BUYER | Owner/hold/gateway |
| POST /payments/webhook | Explicit public method | Signature verification before business processing; regression |
| GET /mock-gateway/status | Explicit public class | Intentional two-route mock controller only + MockGatewayEnabledGuard |
| POST /mock-gateway/submit | Explicit public class | Same enabled guard, existing mock transaction contract |
| GET /scanner/qr-keys | STAFF/ADMIN/ORGANIZER method | Public verification keys only |
| GET /scanner/showtimes | STAFF/ADMIN/ORGANIZER method | Scanner-specific assignment scope |
| GET /scanner/showtimes/:showtimeId/tickets | STAFF/ADMIN/ORGANIZER method | Assignment/permission |
| GET /showtimes/:showtimeId/check-in/gates | STAFF/ORGANIZER/ADMIN class | Scoped gate permission |
| POST /showtimes/:showtimeId/check-in | STAFF/ORGANIZER/ADMIN class | Signed ticket + scope/idempotency |
| POST /showtimes/:showtimeId/check-in/exception | STAFF/ORGANIZER/ADMIN class | Explicit override permission, no blanket admin |

Monitoring metrics is a separate opt-in private HTTP server, not a Nest public-controller bypass: only GET/metrics with constant-time token; otherwise401/404, bindloopback default. Not enabled in this demo.

Runtime evidence: buyer POST/PATCH/showtime403; organizerB owner403; multi-role allowed own management; admin-alone cannot list organizer events; root authenticated403; expired/me401; logout replay401. RolesGuard logs route handler + role mismatch/default deny, without email/token/password/IP/rawrequest. Owner/data FK delete policy remains RESTRICT: user→events, event→showtimes/orders, showtime/seat/orderitem→historical references cannot cascade-delete paid history. No deletion feature introduced.

Later modules are inventoried because global auth/proxy affects them;109integration regressions do not reclassify their story/sprint acceptance.
