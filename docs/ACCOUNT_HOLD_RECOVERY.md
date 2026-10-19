# S-14 account hold recovery

The authenticated account owns its unexpired booking round for a showtime.
`sessionHash` remains a stored row locator for migration compatibility; an old
browser cookie is not needed to restore the hold. The session guard still checks
the current authenticated user and active account on every HTTP request.

`claim_hold_v5` locks the buyer row before selecting the existing round, then
delegates to the existing bounded v4 claim routine. Order creation takes the same
first lock. Parallel claims from two sessions therefore use one round, token and
original expiry. Adding seats, logging in again and retrying do not renew expiry.
GET current hold uses the database clock and the authenticated user; it never
accepts a client owner, token or deadline. No browser storage is authoritative.

## Existing data and rollout

Migration `202610190002_account_hold_recovery` only creates a function. It does
not update historical rows, deadlines, tokens, constraints or order references.
It retains v2/v3/v4 routines for rollback compatibility. Apply the additive
migration before starting the new API. Back up and review migration compatibility
using the existing laptop staging release procedure before deployment.

A single pre-existing round is adopted using its stored locator. If legacy code
has already created multiple unexpired rounds for the same buyer/showtime, reads
return `503 HOLD_AMBIGUOUS`, claims fail closed, and order creation returns
`409 HOLD_CHANGED`. The API does not silently combine prices, rewrite references
or extend either deadline. After the original rounds expire a new claim can
reuse a locator normally. Inventory such cases before rollout. Existing orders
retain their original idempotent response and expiry.

Rollback the API to its preceding image while leaving the additive function in
place. This restores prior session-scoped behavior; it is an operational rollback,
not S-14 acceptance. Do not edit an applied migration, drop/reset data or change
old tokens. If removal ever becomes necessary, use a separately reviewed forward
compensating migration after confirming no running caller uses v5.

## Verification

`test/account-hold-recovery.e2e-spec.ts` uses AppModule, real PostgreSQL/Redis,
generated synthetic IDs and worker-off guards. It verifies two sessions, actual
logout/login, other-account isolation, parallel first claims and final database
state, exact order deadline, legacy locator adoption, ambiguous legacy data and
expiry/reclaim. Cleanup is limited to this suite's generated fixture IDs.

`test/s15-s16-acceptance.e2e-spec.ts` retains the real lock-wait and fresh-clock
expiry assertion; its activity query watches v5, the production entrypoint.
Transaction unit tests exercise each supported routine version explicitly.
Local automated sessions do not prove access on physical devices or staging.
Performance acceptance requires the existing full HTTP workload and original
local p95 threshold; functional tests alone do not establish that NFR.
