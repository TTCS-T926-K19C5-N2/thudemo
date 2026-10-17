import { test } from "node:test";
import assert from "node:assert/strict";
import { requireBuildResources } from "./laptop-resources.mjs";
const GiB = 1024 ** 3;
test("deployment preflight rejects exhausted system disk before work starts", () => {
  let reads = 0;
  assert.throws(
    () =>
      requireBuildResources({
        workspacePath: ".",
        statfs: () => {
          reads++;
          return { bavail: 0, bsize: 1 };
        },
      }),
    /12 GiB required before build/,
  );
  assert.equal(reads, 1);
});
test("deployment preflight independently rejects insufficient source/backup room", () => {
  let reads = 0;
  assert.throws(
    () =>
      requireBuildResources({
        workspacePath: ".",
        statfs: () => ({
          bavail: ++reads === 1 ? 13 * GiB : 4 * GiB,
          bsize: 1,
        }),
      }),
    /5 GiB required before build/,
  );
});
test("deployment preflight accepts both volumes only above their headroom", () => {
  const report = requireBuildResources({
    workspacePath: ".",
    statfs: () => ({ bavail: 20 * GiB, bsize: 1 }),
  });
  assert.equal(report.length, 2);
  assert.deepEqual(
    report.map((row) => row.minimumBytes),
    [12 * GiB, 5 * GiB],
  );
});
test("unknown filesystem capacity is fail closed", () => {
  assert.throws(
    () =>
      requireBuildResources({
        workspacePath: ".",
        statfs: () => ({ bavail: NaN, bsize: 1 }),
      }),
    /required before build/,
  );
});
