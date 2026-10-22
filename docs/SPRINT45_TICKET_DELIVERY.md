# S27/S38 ticket delivery increment

The PAID transaction creates one durable `TicketMailDelivery` with the existing
minimal tickets. The worker never issues tickets: it projects canonical ET1 QR
payloads through the same owner service as HTTP and MyTickets. GET, download,
callback replay and resend preserve persisted identities. Cancelled tickets
have no QR and are omitted from email. No payment details are rendered.

`TICKET_MAIL_WORKER=true` starts the process lifecycle worker every two seconds.
Its SQL claim uses SKIP LOCKED and a sixty-second fenced lease. A successful
status requires actual SMTP acceptance; failure retries after five and fifteen
seconds, at most three transport attempts. Exhaustion/interrupted final attempt
is recorded for the authenticated admin endpoint `GET /tickets/mail-failures`.
SMTP is at least once: a provider ACK lost before database commit can cause
redelivery with the stable Message-ID, not a second ticket. A second worker
cannot commit an expired owner's lease result.

Default ticket transport reuses the configured T08 MailService. For a separate
fake-data laptop profile use `TICKET_MAIL_MODE=catcher`, `TICKET_SMTP_HOST`,
`TICKET_SMTP_PORT`, `TICKET_SMTP_FROM`, `TICKET_MAIL_ALLOWED_EMAILS`. The catcher
must be localhost/127.0.0.1/mailpit in a non-production APP_ENV; it does not
replace registration SMTP. Internet delivery needs its own receipt evidence.
Do not enable this worker against test-suite fixtures or real buyers without
verifying the target and configured transport.

`POST /orders/:id/tickets/resend` requires buyer ownership, PAID/current ticket
eligibility and a UUID requestId before returning an idempotent result. Reusing
the request for another order is rejected. The order's short abuse budget is
three resend jobs per minute; replay does not consume another job.

`/account/tickets` lists only the signed-in buyer's PAID tickets, upcoming first
and past last with server pagination. The same512px PNG renderer supports the
order view and a native download link; cancelled cards are dim and expose no QR.
Session changes clear the old view. Login has a narrowly allowed local return
destination for this page.

Migration190006 adds the outbox without rewriting orders/tickets or backfilling
emails to existing PAID orders. Application rollback can leave the table/data;
do not delete queued deliveries or narrow previously applied migrations.

Local proof includes real SMTP-catcher receipts/inline images, Ed25519 validation,
actual scanner API admission, automatic outage retries and desktop/mobile UI.
The Html5Qrcode file decoder misses some intact images at zero-degree alignment;
the same received/downloaded bytes decode after a lossless ninety-degree turn.
Evidence retains failed orientations. This is not physical camera, sunlight,
Internet mailbox or production payment acceptance.
