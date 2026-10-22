# Sprint4/5 online candidate

This increment covers the owner ticket projection and operative online scanner,
not completion of all Sprint4/5 acceptance criteria.

- Exactly one `GET /orders/:id/tickets` is registered. HTTP and
  `TicketsService.listForOrder` share `TicketQrService`; downstream email and
  downloads must call that projection rather than encoding the legacy columns.
- The projection requires PAID and the minimal persisted ticket for every seat.
  GET never creates tickets. ET1 identity remains the existing random order-item
  UUID, understood by the online scanner and snapshot. Cancelled tickets have no
  QR. Legacy database identifiers/signatures are retained without data migration.
- `/tickets/public-keys` exposes the same persisted scanner keyring as
  `/scanner/qr-keys`, including retired public keys. No private key is returned.
  No new ephemeral ET1 key or key rotation policy is introduced.
- `/check-in` leads to `/scanner`. Today means the Vietnam calendar day.
  The server lists only shows with an explicit gate grant. Selection precedes
  camera activation; the selected server gate UUID is remembered per show.
- Admins can create staff through the existing account UI and grant/revoke a
  show/gate there. The separate `canOverride` capability is explicit. Grant,
  compatibility show assignment and actor audit commit together. Changes apply
  to an existing session's next request. Assignment input is validated before SQL.
- Normal admission retains its database uniqueness and transaction. Rejections
  distinguish unknown/unsigned, wrong show, cancelled and already used; structured
  server logs record reason code and actor/gate/request identifiers without QR or
  customer data. Exceptions retain the original normal admission and require a
  capability, owner confirmation and reason.
- Online network failure is an unconfirmed request, never proof of admission.
  An unsigned QR must not become locally admitted when the request fails.

## Migration and rollback

`202610190005_staff_gate_audit` extends the existing audit action check with
ASSIGN_GATE/REVOKE_GATE inside one transaction; it retains every old row and all
old action values. No schema reset or historical migration edit is required.
An application rollback can retain the expanded constraint and grant records;
do not erase audit history or narrow the check while these actions exist.

## Remaining scope

S27 SMTP/outbox and S38 ticket/download UI follow this increment. S33–37 still
require queue unification, durable restart evidence, transactional replay and
device-time conflict resolution. Physical camera, sunlight readability, real
4G/5000-ticket timing and Internet email delivery require separate evidence.
Local synthetic PAID fixtures do not prove a payment provider or refunds.
