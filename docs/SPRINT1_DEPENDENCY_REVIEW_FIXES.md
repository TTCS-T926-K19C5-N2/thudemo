# Sprint 1 dependency integration: authentication review fixes

Date: 2026-10-05. AI-assisted implementation by Codex under the authorization of Nguyễn Văn Sáng. This is not evidence that a human independently reviewed the code.

## Reviewed revision and findings

PR #3 original head: `8ad585849d1b24605b3b1ba7513a1b4dfa1371d9`.

- Introduced regression: login lowercased an email while existing registration retained casing. Login now matches casing without rewriting stored identities; ambiguous legacy casing is rejected without creating a session.
- Baseline security defect carried into the dependency: an absent activation token could omit the Prisma predicate. Tokens are now validated before database access and consumed by one conditional update with deadline and unverified-state checks. Concurrent replay has exactly one success.
- No schema/migration, registration delivery, privacy notice, public role, or frontend change.

## Local evidence

Clean worktree, Node 24.21.0 and pnpm 10.15.1; dedicated synthetic PostgreSQL/Redis fixtures, not the preview database.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS, unchanged lockfile, 14.3 seconds |
| Original regression tests against the reviewed head | 3 failures / 2 successes; mixed-case login, identity ambiguity and missing activation token reproduced |
| `pnpm --filter api run test:e2e` after fixes | PASS, 11 tests / 4 files, 6.56 seconds |
| `pnpm lint` | PASS; new test sort comparator subsequently corrected and API lint rerun without warnings |
| `pnpm typecheck` | PASS; rerun API typecheck after final test changes |
| `pnpm test` | PASS, 4 unit tests |
| `pnpm build` | PASS, API and all seven web routes |
| `git diff --check` | PASS |

Six new real HTTP/database cases cover existing mixed-case identity, ambiguous identities, existing registration/activation/login, missing/empty/malformed/repeated query parameters, expiry, valid consumption/replay/concurrent replay.

## Gates and rollback

CI for the newly pushed head and a human review are required before merge. Existing CI evidence for the original head does not approve this revision. Staging and task DoD remain open. No task status is changed.

Rollback: revert this fix commit through a reviewed PR. Database schema and migration checksums are unchanged; no reset or destructive rollback is needed. Keep the fix while diagnosing unless reinstating the known activation vulnerability is explicitly accepted.
