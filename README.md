# thudemo — portable demo Sprint4–5

**Clone `develop`**; `main` is not the handoff branch. Demo only: S19 mock payment, SMTP catcher, fake accounts and fixture PAID orders. This is not production-ready or complete AC/NFR/DoD acceptance. The current laptop URL is operational information in the handoff, not a hardcoded application setting.

## Start from a clean clone

Prerequisites: Git; Docker Desktop Linux engine or Docker Engine with Compose supporting `service_completed_successfully` and `up --wait` (tested Desktop/Compose 5.1.4 on Windows). No host Node, pnpm, Prisma, Codex runtime or shared worktree dependencies. Allow at least **12 GiB free on Docker/system disk, 8 GiB on checkout disk, 4 GiB available RAM**; first image build needs network access. Tested on one Windows laptop with isolated Linux containers, not every OS. Ports **3488 web** and **8138 email UI** must be free; change both URL/port fields in `.env` if needed. PostgreSQL/Redis/API are private to this Compose project.

```text
git clone --branch develop --single-branch https://github.com/TTCS-T926-K19C5-N2/thudemo.git
cd thudemo
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, `cp .env.example .env` on Linux). Set **POSTGRES_PASSWORD** and **DEMO_PASSWORD** to two different private values of at least12 characters (DB password: letters/digits/underscore/hyphen only); replace both placeholders. Retain this file privately. Other defaults work for localhost.

One startup command, from this clone root:

```text
docker compose --env-file .env -f compose.demo.yml up --build -d --wait
```

Only proceed if command succeeds: migration/init failure blocks API/web. Open **http://localhost:3488**, email catcher **http://localhost:8138** (or configured ports). Accounts and5–10minute scenario: [HUONG_DAN_DEMO.md](HUONG_DAN_DEMO.md). Credentials: configured `DEMO_PASSWORD` in ignored `.env`; all role emails are listed in the guide. Do not publish `.env`, keys or exported fixture.

The command builds pinned Node24.21.0/pnpm10.15.1 images with frozen lockfile, starts healthy PostgreSQL15/Redis7 and Mailpit, initializes persistent Ed25519/auth keys once, locks migration then runs committed Prisma migrations, adds missing fake demo data and starts API/actual ticket-mail worker plus web. Demo API runs compiled code with `NODE_ENV=development`, explicitly required by the existing mock-payment gate, `APP_ENV=demo`; production API mode still rejects mock. No source watcher or weakened RBAC/signatures. Web uses production Next build and same-origin `/api`; `API_INTERNAL_URL=http://api:3001` stays server-only. Compose only consumes this `.env`; no host/parent `.env`, keys or dependencies mounted. Legacy local setup is in `.env.development.example`; do not mix profiles.

## Status, stop and restart without data loss

```text
docker compose --env-file .env -f compose.demo.yml ps -a
docker compose --env-file .env -f compose.demo.yml logs --tail 80 prepare api web
docker compose --env-file .env -f compose.demo.yml stop
docker compose --env-file .env -f compose.demo.yml up --build -d --wait
```

Reuse the startup command after changing demo date/batch or source. `restart` alone does not re-read configuration. Named volumes retain DB, Redis, signing keys and Mailpit receipts. **Never `down -v`, DB reset or delete volumes to prepare a demo**. Changing password on an existing key volume fails explicitly; user/password edits belong in the administration UI. Changing DB password requires a separate deliberate database credential migration, not editing `.env` alone. Use a distinct `COMPOSE_PROJECT_NAME` for a new isolated installation.

Seed runs only in explicit demo mode. Blank `DEMO_DATE` selects today's Vietnam date; use YYYY-MM-DD to prepare a future day. Existing dataset is not reset. Change `DEMO_BATCH=2` and rerun startup to **add** another event/ticket batch for the selected day. Old used/cancelled tickets remain unchanged. `DEMO_SEED=false` skips fixture creation. Admin UI creates additional staff; no production account provisioning claimed.

## LAN / camera

Localhost is a browser secure context: camera/service worker work at `http://localhost`. QR text input is a fallback for the presentation, not hardware-camera acceptance. A phone's `localhost` refers to the phone. For LAN, place an HTTPS reverse proxy in front of this web port, use a certificate with the real hostname/IP SAN, trust its CA on each device and set `PUBLIC_URL=https://<that-host>:<tls-port>`. Bind web only to the intended local interface via `DEMO_BIND_ADDRESS`, allow only the selected firewall port/local subnet; SMTP UI remains loopback. Reverse proxy must preserve Origin/Host and forward to the **web server**, never expose API/DB/Redis. No automatic certificate trust/firewall edits. Existing laptop HTTPS staging remains a separate profile; do not copy its keys/database/config. Exact LAN proxy/certificate provisioning on a second machine is not part of the localhost clone proof.

## Boundaries

[POST_DEMO_BACKLOG.md](POST_DEMO_BACKLOG.md) records device/provider/performance and integration limitations. No Internet email, real payment/refund or physical outdoor camera proof is implied. Old Sprint1 guides under `docs/` remain historical; this entrypoint is the Sprint4–5 handoff.
