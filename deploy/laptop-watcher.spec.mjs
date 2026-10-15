import { watchOnce } from "../scripts/sprint1-staging-watch.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const sha = "a".repeat(40),
  minimum = "b".repeat(40);
const base = ["T-02 / build-and-typecheck", "T-02 / lint", "T-02 / test"].map(
  (name) => ({
    name,
    head_sha: sha,
    app: { slug: "github-actions" },
    status: "completed",
    conclusion: "success",
  }),
);
export function rehearse() {
  const dir = mkdtempSync(resolve(tmpdir(), "sprint1-watcher-gate-"));
  const outcomes = [];
  try {
    for (const mode of [
      "red",
      "missing",
      "pending",
      "wrong-sha",
      "wrong-app",
      "extra-red",
      "truncated",
      "missing-ancestor",
      "busy",
      "success",
    ]) {
      const checks = structuredClone(base);
      if (mode === "red") checks[2].conclusion = "failure";
      if (mode === "missing") checks.pop();
      if (mode === "pending") {
        checks[2].status = "in_progress";
        checks[2].conclusion = null;
      }
      if (mode === "wrong-sha") checks[2].head_sha = "c".repeat(40);
      if (mode === "wrong-app") checks[2].app.slug = "untrusted-app";
      if (mode === "extra-red")
        checks.push({
          ...base[0],
          name: "S-43 / monitoring-integration",
          conclusion: "failure",
        });
      const marker = resolve(dir, mode + ".json");
      const events = [],
        commands = [];
      watchOnce({
        minimum,
        run: (cmd, args) => {
          commands.push([cmd, ...args]);
          if (cmd === "gh")
            return {
              status: 0,
              stdout: JSON.stringify({
                total_count: checks.length + (mode === "truncated" ? 1 : 0),
                check_runs: checks,
              }),
            };
          if (args[0] === "rev-parse") return { status: 0, stdout: sha };
          return {
            status:
              mode === "missing-ancestor" && args[0] === "merge-base" ? 1 : 0,
            stdout: "",
          };
        },
        activeSha: () => null,
        busy: () => mode === "busy",
        event: (status, details) => events.push({ status, ...details }),
        deploy: (revision) =>
          spawnSync(
            process.execPath,
            [
              "-e",
              'require("fs").writeFileSync(process.argv[1],JSON.stringify({revision:process.argv[2]}))',
              marker,
              revision,
            ],
            { windowsHide: true },
          ),
      });
      const deployed = existsSync(marker);
      assert.equal(deployed, mode === "success", mode);
      if (deployed)
        assert.equal(JSON.parse(readFileSync(marker)).revision, sha);
      outcomes.push({
        mode,
        commands,
        events,
        deploymentChildStarted: deployed,
        result: "PASS",
      });
    }
    return {
      time: new Date().toISOString(),
      kind: "Controlled orchestration rehearsal using production watchOnce; fixture Git/GitHub adapters, real isolated child deployment sentinel. Not a live GitHub red run or post-merge auto-deploy.",
      outcomes,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("watcher full polling/check/deployment path blocks non-green checks", () =>
  rehearse());
if (process.env.SPRINT1_WATCHER_EVIDENCE)
  writeFileSync(
    process.env.SPRINT1_WATCHER_EVIDENCE,
    JSON.stringify(rehearse(), null, 2),
  );
