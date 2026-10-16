import {
  watchOnce,
  runWatcherCommand,
  watcherPollDelay,
} from "../scripts/sprint1-staging-watch.mjs";
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
import { basename, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
const sha = "a".repeat(40),
  minimum = "b".repeat(40);
const base = [
  "T-02 / build-and-typecheck",
  "T-02 / lint",
  "T-02 / test",
  "K-01 / candidate-research",
  "T-31 / hold-concurrency",
].map((name) => ({
  name,
  head_sha: sha,
  app: { slug: "github-actions" },
  status: "completed",
  conclusion: "success",
}));
export function rehearse() {
  const dir = mkdtempSync(resolve(tmpdir(), "sprint1-watcher-gate-"));
  const outcomes = [];
  try {
    for (const mode of [
      "red",
      "missing",
      "missing-research",
      "pending",
      "wrong-sha",
      "wrong-app",
      "extra-red",
      "truncated",
      "missing-ancestor",
      "busy",
      "fetch-timeout",
      "checks-timeout",
      "success",
    ]) {
      let checks = structuredClone(base);
      if (mode === "red") checks[2].conclusion = "failure";
      if (mode === "missing") checks.pop();
      if (mode === "missing-research")
        checks = checks.filter(
          (check) => check.name !== "K-01 / candidate-research",
        );
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
          if (
            (mode === "fetch-timeout" && args[0] === "fetch") ||
            (mode === "checks-timeout" && cmd === "gh")
          )
            return { status: null, error: { code: "ETIMEDOUT" }, stdout: "" };
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
    assert(dir.startsWith(resolve(tmpdir()) + sep));
    assert(basename(dir).startsWith("sprint1-watcher-gate-"));
    rmSync(dir, { recursive: true, force: true });
  }
}
test("watcher full polling/check/deployment path blocks non-green checks", () =>
  rehearse());

test("watcher commands are bounded and cannot prompt for credentials", () => {
  let options;
  runWatcherCommand("git", ["fetch", "origin", "develop"], {
    runner: (_command, _args, received) => {
      options = received;
      return { status: 0, stdout: "" };
    },
  });
  assert.equal(options.timeout, 20000);
  assert.equal(options.windowsHide, true);
  assert.equal(options.env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(options.env.GCM_INTERACTIVE, "false");
  assert.equal(watcherPollDelay("BLOCKED_CI_not_all_success"), 15000);
  assert.equal(watcherPollDelay("BLOCKED_watcher_error"), 15000);
  assert.equal(watcherPollDelay("active"), 60000);
});

test("real stalled Git HTTP fetch times out and a subsequent attempt can run", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "sprint1-fetch-deadline-"));
  const server = spawn(
    process.execPath,
    [
      "-e",
      `const http=require('node:http');let reject=false;
       process.on('message',()=>{reject=true;process.send('ready')});
       const s=http.createServer((q,r)=>{if(reject){r.writeHead(403);r.end()}});
       s.listen(0,'127.0.0.1',()=>process.stdout.write(String(s.address().port)+'\\n'));
       setTimeout(()=>process.exit(0),10000);`,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  try {
    const port = await new Promise((done, reject) => {
      const timer = setTimeout(
        () => reject(Error("Local fixture did not start")),
        5000,
      );
      server.stdout.once("data", (bytes) => {
        clearTimeout(timer);
        done(Number(bytes.toString().trim()));
      });
      server.once("error", reject);
    });
    assert.equal(spawnSync("git", ["init", "--bare", dir]).status, 0);
    assert.equal(
      spawnSync("git", [
        "-C",
        dir,
        "remote",
        "add",
        "origin",
        `http://127.0.0.1:${port}/fixture.git`,
      ]).status,
      0,
    );
    const args = ["-c", "credential.helper=", "fetch", "origin", "develop"];
    const stalled = runWatcherCommand("git", args, {
      cwd: dir,
      timeoutMs: 500,
    });
    assert.equal(stalled.error?.code, "ETIMEDOUT");
    assert(
      stalled.elapsedMs < 2500,
      "A stalled fetch must return to the polling loop",
    );
    assert.equal(existsSync(resolve(dir, "FETCH_HEAD.lock")), false);
    await new Promise((done, reject) => {
      const timer = setTimeout(
        () => reject(Error("Fixture recovery timeout")),
        2000,
      );
      server.once("message", () => {
        clearTimeout(timer);
        done();
      });
      server.send("reject");
    });
    const retry = runWatcherCommand("git", args, { cwd: dir, timeoutMs: 2000 });
    assert.notEqual(retry.status, 0);
    assert.notEqual(retry.error?.code, "ETIMEDOUT");
  } finally {
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      const closed = new Promise((done) => server.once("close", done));
      server.kill();
      await closed;
    }
    assert(dir.startsWith(resolve(tmpdir()) + sep));
    assert(basename(dir).startsWith("sprint1-fetch-deadline-"));
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});
if (process.env.SPRINT1_WATCHER_EVIDENCE)
  writeFileSync(
    process.env.SPRINT1_WATCHER_EVIDENCE,
    JSON.stringify(rehearse(), null, 2),
  );
