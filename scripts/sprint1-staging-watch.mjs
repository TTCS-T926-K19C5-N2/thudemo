import {
  readFileSync,
  appendFileSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, ".."),
  dir = resolve(root, ".sprint1-staging");
const minimum = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(minimum ?? ""))
  throw new Error(
    "Pass the exact approved feature/integration SHA as minimum ancestor",
  );
const repo = "TTCS-T926-K19C5-N2/thudemo";
const required = ["T-02 / build-and-typecheck", "T-02 / lint", "T-02 / test"];
const run = (cmd, args) =>
  spawnSync(cmd, args, { cwd: root, encoding: "utf8", windowsHide: true });
let priorStatus = "";
function event(status, details = {}) {
  const key = JSON.stringify({ status, ...details });
  if (key === priorStatus) return;
  priorStatus = key;
  appendFileSync(
    resolve(dir, "watcher.jsonl"),
    JSON.stringify({ time: new Date().toISOString(), status, ...details }) +
      "\n",
  );
}
for (;;) {
  try {
    if (run("git", ["fetch", "origin", "develop"]).status !== 0)
      throw new Error("fetch_failed");
    const sha = run("git", ["rev-parse", "origin/develop"]).stdout.trim();
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("invalid_develop_sha");
    if (
      run("git", ["merge-base", "--is-ancestor", minimum, sha]).status !== 0
    ) {
      event("BLOCKED_develop_missing_approved_fix", { sha });
    } else if (
      existsSync(resolve(dir, "active.json")) &&
      JSON.parse(readFileSync(resolve(dir, "active.json"))).sha === sha
    ) {
      event("active", { sha });
    } else {
      const checksResult = run("gh", [
        "api",
        `repos/${repo}/commits/${sha}/check-runs?per_page=100`,
      ]);
      if (checksResult.status !== 0) throw new Error("checks_unavailable");
      const response = JSON.parse(checksResult.stdout);
      const checks = response.check_runs ?? [];
      if (response.total_count !== checks.length)
        throw new Error("checks_truncated_fail_closed");
      const core = required.every((name) =>
        checks.some(
          (check) =>
            check.name === name &&
            check.app?.slug === "github-actions" &&
            check.head_sha === sha &&
            check.status === "completed" &&
            check.conclusion === "success",
        ),
      );
      if (
        !core ||
        checks.length === 0 ||
        checks.some(
          (check) =>
            check.head_sha !== sha ||
            check.status !== "completed" ||
            check.conclusion !== "success",
        )
      ) {
        event("BLOCKED_CI_not_all_success", { sha });
      } else if (existsSync(resolve(dir, "deployment.lock"))) {
        event("deployment_busy", { sha });
      } else {
        event("deploy_after_CI", { sha });
        const fd = openSync(resolve(dir, "watcher-deploy.log"), "a");
        const deployed = spawnSync(
          process.execPath,
          [
            resolve(root, "scripts/sprint1-staging.mjs"),
            "deploy",
            "--sha",
            sha,
          ],
          { cwd: root, windowsHide: true, stdio: ["ignore", fd, fd] },
        );
        closeSync(fd);
        event(
          deployed.status === 0
            ? "deploy_complete"
            : "deploy_failed_old_retained",
          { sha },
        );
      }
    }
  } catch (error) {
    event("BLOCKED_watcher_error", { reason: error.message });
  }
  await new Promise((resolve) => setTimeout(resolve, 60000));
}
