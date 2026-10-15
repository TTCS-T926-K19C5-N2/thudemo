import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareTicketKey,
  ticketKeyEnv,
  requireMigrationReview,
  parseProcessIdentity,
} from "./laptop-compat.mjs";
test("persistent ticket key is preserved and missing keys fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "sprint1-key-"));
  try {
    assert.throws(() => ticketKeyEnv(dir));
    const first = prepareTicketKey(dir),
      bytes = readFileSync(join(dir, "ticket-signing.der.b64"));
    assert.deepEqual(prepareTicketKey(dir), first);
    assert.deepEqual(readFileSync(join(dir, "ticket-signing.der.b64")), bytes);
    assert.equal(first.TICKET_SIGNING_ACTIVE_KEY_ID, "sprint1-staging-ticket");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("automatic migration change fails closed; exact prior SHA acknowledgement is required", () => {
  const sha = "a".repeat(40);
  assert.throws(() => requireMigrationReview(sha, "new.sql", undefined));
  assert.throws(() => requireMigrationReview(sha, "new.sql", "b".repeat(40)));
  assert.doesNotThrow(() => requireMigrationReview(sha, "new.sql", sha));
  assert.doesNotThrow(() => requireMigrationReview(sha, "", undefined));
});
test("CIM failures cannot be interpreted as a dead process or recoverable lock", () => {
  assert.throws(() => parseProcessIdentity({ status: 1, stdout: "" }));
  assert.throws(() =>
    parseProcessIdentity({ status: null, error: new Error(), stdout: "" }),
  );
  assert.equal(parseProcessIdentity({ status: 0, stdout: "" }), null);
  assert.deepEqual(
    parseProcessIdentity({ status: 0, stdout: '{"created":"time"}' }),
    { created: "time" },
  );
});
