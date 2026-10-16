import {
  readFileSync,
  appendFileSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const repo = "TTCS-T926-K19C5-N2/thudemo";
const required = ["T-02 / build-and-typecheck", "T-02 / lint", "T-02 / test"];

// The same orchestration is used by the live watcher and the controlled gate
// rehearsal. Only adapters differ; fixtures never operate the staging profile.
export function watchOnce({ minimum, run, activeSha, busy, deploy, event }) {
  if (!/^[a-f0-9]{40}$/.test(minimum ?? ""))
    throw Error("Exact minimum ancestor required");
  try {
    if (run("git", ["fetch", "origin", "develop"]).status !== 0)
      throw Error("fetch_failed");
    const revision = run("git", ["rev-parse", "origin/develop"]);
    if (revision.status !== 0) throw Error("revision_unavailable");
    const sha = revision.stdout.trim();
    if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("invalid_develop_sha");
    if (run("git", ["merge-base", "--is-ancestor", minimum, sha]).status !== 0)
      return event("BLOCKED_develop_missing_approved_fix", { sha });
    if (activeSha() === sha) return event("active", { sha });
    const result = run("gh", [
      "api",
      `repos/${repo}/commits/${sha}/check-runs?per_page=100`,
    ]);
    if (result.status !== 0) throw Error("checks_unavailable");
    const response = JSON.parse(result.stdout);
    const checks = response.check_runs;
    if (!Array.isArray(checks) || response.total_count !== checks.length)
      throw Error("checks_truncated_fail_closed");
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
    )
      return event("BLOCKED_CI_not_all_success", { sha });
    if (busy()) return event("deployment_busy", { sha });
    event("deploy_after_CI", { sha });
    const deployed = deploy(sha);
    return event(
      deployed.status === 0 ? "deploy_complete" : "deploy_failed_old_retained",
      { sha },
    );
  } catch (error) {
    return event("BLOCKED_watcher_error", { reason: error.message });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(import.meta.dirname, "..");
  const dir = resolve(root, ".sprint1-staging");
  const minimum = process.argv[2];
  if (!/^[a-f0-9]{40}$/.test(minimum ?? ""))
    throw Error(
      "Pass exact approved feature/integration SHA as minimum ancestor",
    );
  const run = (cmd, args) =>
    spawnSync(cmd, args, { cwd: root, encoding: "utf8", windowsHide: true });
  let priorStatus = "";
  const event = (status, details = {}) => {
    const key = JSON.stringify({ status, ...details });
    if (key === priorStatus) return;
    priorStatus = key;
    appendFileSync(
      resolve(dir, "watcher.jsonl"),
      JSON.stringify({ time: new Date().toISOString(), status, ...details }) +
        "\n",
    );
  };
  for (;;) {
    watchOnce({
      minimum,
      run,
      event,
      activeSha: () =>
        existsSync(resolve(dir, "active.json"))
          ? JSON.parse(readFileSync(resolve(dir, "active.json"))).sha
          : null,
      busy: () => existsSync(resolve(dir, "deployment.lock")),
      deploy: (sha) => {
        const fd = openSync(resolve(dir, "watcher-deploy.log"), "a");
        try {
          return spawnSync(
            process.execPath,
            [
              resolve(root, "scripts/sprint1-staging.mjs"),
              "deploy",
              "--sha",
              sha,
            ],
            { cwd: root, windowsHide: true, stdio: ["ignore", fd, fd] },
          );
        } finally {
          closeSync(fd);
        }
      },
    });
    await new Promise((done) => setTimeout(done, 60000));
  }
}
