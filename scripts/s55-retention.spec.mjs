import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  backupName,
  decryptToWritable,
  encryptReadable,
  encryptionKey,
  normalizePrefix,
  retentionPlan,
  S55_BACKUP_RE,
} from "./s55-lib.mjs";

describe("S-55 retention", () => {
  it("keeps exactly the 14 newest encrypted backups", () => {
    const objects = Array.from({ length: 16 }, (_, index) => ({
      Key: `postgres/nightly/s55-202610${String(index + 1).padStart(2, "0")}T000000Z-12345678.dump.gcm`,
      LastModified: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
    }));
    const { kept, pruned } = retentionPlan(objects, 14);
    assert.equal(kept.length, 14);
    assert.equal(pruned.length, 2);
    assert.equal(pruned[0].Key, objects[0].Key);
    assert.equal(kept.at(-1).Key, objects.at(-1).Key);
  });

  it("ignores unrelated objects under the prefix", () => {
    const valid = { Key: "x/s55-20261016T000000Z-abcdef12.dump.gcm", LastModified: "2026-10-16T00:00:00Z" };
    const plan = retentionPlan([
      valid,
      { Key: "x/manifest.json", LastModified: "2026-10-17T00:00:00Z" },
      { Key: "x/s55-20261016.dump", LastModified: "2026-10-18T00:00:00Z" },
    ]);
    assert.deepEqual(plan.kept, [valid]);
  });
});

describe("S-55 AES-256-GCM envelope", () => {
  it("round-trips data and rejects one-byte tampering", async () => {
    const dir = await mkdtemp(join(tmpdir(), "s55-"));
    const encrypted = join(dir, "backup.dump.gcm");
    const key = Buffer.alloc(32, 7);
    try {
      const source = new PassThrough();
      source.end(Buffer.from("fake-custom-format-backup"));
      await encryptReadable(source, encrypted, key);
      const target = new PassThrough();
      const chunks = [];
      target.on("data", (chunk) => chunks.push(chunk));
      await decryptToWritable(encrypted, target, key);
      assert.equal(Buffer.concat(chunks).toString(), "fake-custom-format-backup");

      const bytes = await readFile(encrypted);
      bytes[25] ^= 1;
      await writeFile(encrypted, bytes);
      await assert.rejects(
        decryptToWritable(encrypted, new PassThrough(), key),
        /authenticate|auth|Unsupported state/i,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires a 32-byte base64 key", () => {
    assert.equal(encryptionKey(Buffer.alloc(32, 1).toString("base64")).length, 32);
    assert.throws(() => encryptionKey(Buffer.alloc(16).toString("base64")), /32 bytes/);
  });
});

describe("S-55 names and config", () => {
  it("uses sortable UTC encrypted backup names", () => {
    const name = backupName(new Date("2026-10-16T00:00:00Z"), "abcdef12");
    assert.equal(name, "s55-20261016T000000Z-abcdef12.dump.gcm");
    assert.equal(S55_BACKUP_RE.test(name), true);
  });

  it("accepts a safe S3 prefix and rejects traversal", () => {
    assert.equal(normalizePrefix("/postgres/nightly/"), "postgres/nightly");
    assert.throws(() => normalizePrefix("../private"), /invalid/);
  });

  it("does not contain direct secret logging", async () => {
    for (const file of ["scripts/s55-backup.mjs", "scripts/s55-restore.mjs"]) {
      const source = await readFile(file, "utf8");
      assert.equal(/console\.(log|error)\([^\n]*(databaseUrl|target\b|PGDATABASE|ENCRYPTION_KEY)/.test(source), false);
    }
  });
});
