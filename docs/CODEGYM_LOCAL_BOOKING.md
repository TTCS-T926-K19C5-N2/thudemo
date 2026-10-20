# Codegym local booking

Primary project: `D:\Merge_2\Codegym`.

- Web: http://localhost:3000
- API: http://localhost:3001/health
- Database: `codegym_local` on localhost:5432, container `thudemo-postgres-1`.
- Port 3002/3003 belongs to the separate reference application.

When services are stopped, run `pnpm dev` from the primary project. The launcher loads this project's `.env` before starting both services. It does not seed, import, migrate or reset a database. Do not start a second copy while the same ports are occupied.

## Local inventory enabled on 2026-10-20

The user explicitly requested test booking on all existing 40 events. A full database backup and a snapshot of the previous showtime states were saved before changing exactly 40 showtimes from DRAFT/demo to ON_SALE/non-demo. This enables the existing holding/order/payment logic locally. All event content, identifiers, media, seat coordinates and prices were retained. The configured gateway is `mock`; the website displays a notice that payment is simulated and collects no real money.

Backup directory (ignored by Git): `.cache/local-booking/2026-10-20T02-57-45-265Z/`.

- `database.dump`: complete database backup before the inventory change.
- `showtime-states.json`: exact previous flags and identifiers.
- `environment-before.env`: private local configuration backup; do not publish it.

The one-time guarded operation is recorded in `scripts/enable-local-booking.mjs`. It refuses remote/production databases and non-mock gateways. Do not rerun `--apply` after the inventory has already been enabled.

The API runs from `apps/api` with `node --env-file=../../.env dist/main.js`. Persistent local ticket and scanner keys are kept in ignored `.env`/`.keys/` files. Existing Gmail SMTP settings were retained.

## Verified behavior

A separate database restored from the backup was used to verify the existing Thiên mệnh showtime: 120 seats, successful hold, rejected duplicate booking, idempotent order, mock payment confirmation, signed QR ticket, sold-seat state, sales totals, attendance count and a cloned DRAFT with 120 unoccupied seats. That verification database was removed afterward. No verification orders or tickets were inserted into the primary database.

Local verification result: `.cache/local-booking/verification.json`.

On the website, log in as a buyer, choose an event and seats, create the order, complete the mock gateway and open the order/ticket details. Organizer reports and cloning are available under the owning organizer's event/showtime management pages.
