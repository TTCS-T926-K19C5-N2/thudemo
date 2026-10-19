// Source/resource/correctness wrapper around the portable real-HTTPS client.
// Same laptop, separate client process. Never stop unrelated services or alter TTL.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync, fork } from "node:child_process";
import { cpus, freemem, totalmem } from "node:os";
import https from "node:https";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { stagingConfig, stagingRelease } from "../deploy/laptop-gateway.mjs";
import { requireBuildResources } from "../deploy/laptop-resources.mjs";
const root = resolve(import.meta.dirname, ".."),
  stage = resolve(root, ".sprint1-staging");
const c = stagingConfig(
    JSON.parse(readFileSync(resolve(stage, "config.json"))),
  ),
  activeFile = resolve(stage, "active.json"),
  active = () => stagingRelease(JSON.parse(readFileSync(activeFile))),
  release = active();
const at = process.argv.indexOf("--output");
if (at < 0) throw Error("A new Sprint1 evidence directory is required");
const out = resolve(root, process.argv[at + 1]);
if (
  !out.startsWith(resolve(root, "evidence/sprint1") + "\\") &&
  !out.startsWith(resolve(root, "evidence/sprint1") + "/")
)
  throw Error("Evidence must remain within Sprint1");
if (existsSync(out)) throw Error("Refuse to overwrite a prior run");
mkdirSync(out, { recursive: true });
if (existsSync(resolve(stage, "deployment.lock")))
  throw Error("Own build/deploy is active; do not measure under it");
const report = {
  source: release.sha,
  time: new Date().toISOString(),
  environment:
    "One laptop: separate native client/gateway processes, Docker web and twoAPI/PG/Redis; not an independent device",
  resources: requireBuildResources({ workspacePath: stage }),
  samples: [],
  coldApi: process.argv.includes("--cold-api"),
  protocol: process.argv.includes("--http1") ? "HTTP1.1" : "HTTP2",
};
const save = () =>
  writeFileSync(
    resolve(out, "correlation.json"),
    JSON.stringify(report, null, 2),
  );
const docker = (...args) => {
  const r = spawnSync("docker", args, { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw Error("Owned Docker operation failed");
  return r.stdout.trim();
};
const inspect = (name) => {
  const x = JSON.parse(docker("inspect", name))[0];
  assert.equal(x.Config.Labels["sprint1.staging"], "20261015");
  return x;
};
const ca = readFileSync(resolve(stage, "tls/server-cert.pem")),
  origin = `https://${c.lanAddress}:3470`;
const health = () =>
  new Promise((done, reject) => {
    https
      .get(
        origin + "/api/health",
        { ca, rejectUnauthorized: true, agent: false },
        (r) => {
          r.resume();
          r.once("end", () => done(r.statusCode));
        },
      )
      .once("error", reject);
  });
const snapshot = () => ({
  time: new Date().toISOString(),
  stats: docker(
    "stats",
    "--no-stream",
    "--format",
    "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}",
  ),
  containers: [
    release.apiContainer,
    release.apiReplicaContainer,
    release.webContainer,
    "sprint1-stage-pg-20261015",
    "sprint1-stage-redis-20261015",
  ].map((name) => {
    const x = inspect(name);
    return {
      name,
      image: x.Config.Image,
      revision: x.Config.Labels["org.opencontainers.image.revision"],
      running: x.State.Running,
      user: x.Config.User,
      memoryLimitBytes: x.HostConfig.Memory,
      nanoCpus: x.HostConfig.NanoCpus,
    };
  }),
});
const ownedRun = (step, args) => {
  const fd = openSync(
    resolve(stage, "logs", `load-${Date.now()}-${step}.log`),
    "wx",
  );
  try {
    const r = spawnSync(process.execPath, args, {
      cwd: root,
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    });
    if (r.status !== 0)
      throw Error(step + " failed; inspect private staging log");
  } finally {
    closeSync(fd);
  }
};
let phase = "preflight",
  previous = cpus(),
  monitor;
function sample() {
  const next = cpus();
  let idle = 0,
    total = 0;
  next.forEach((core, i) => {
    idle += core.times.idle - previous[i].times.idle;
    for (const key of Object.keys(core.times))
      total += core.times[key] - previous[i].times[key];
  });
  previous = next;
  report.samples.push({
    time: new Date().toISOString(),
    phase,
    cpuPercent: total ? 100 * (1 - idle / total) : 0,
    freeMemoryBytes: freemem(),
    totalMemoryBytes: totalmem(),
  });
}
try {
  assert.equal(await health(), 200);
  report.before = snapshot();
  const prep = resolve(out, "preparation.json");
  ownedRun("prepare", [
    "scripts/benchmark-sprint1-staging.mjs",
    "--create-synthetic-fixtures",
    "--prepare-remote",
    "--output",
    prep,
  ]);
  const preparation = JSON.parse(readFileSync(prep)),
    clientDir = preparation.remoteDirectory,
    bundle = JSON.parse(
      readFileSync(resolve(clientDir, "sprint1-remote-benchmark.json")),
    );
  assert.equal(bundle.source, release.sha);
  if (report.coldApi) {
    for (const name of [release.apiContainer, release.apiReplicaContainer])
      inspect(name);
    docker("restart", release.apiContainer, release.apiReplicaContainer);
    ownedRun("resume", ["scripts/sprint1-staging.mjs", "resume"]);
  }
  assert.equal(await health(), 200);
  report.beforeMeasuredSetup = { health: 200, source: active().sha };
  monitor = setInterval(sample, 250);
  const fd = openSync(
    resolve(stage, "logs", `load-${Date.now()}-client.log`),
    "wx",
  );
  try {
    const child = fork(
      resolve(clientDir, "sprint1-staging-load-client.mjs"),
      report.protocol === "HTTP1.1" ? ["--http1"] : [],
      { cwd: clientDir, stdio: ["ignore", fd, fd, "ipc"], windowsHide: true },
    );
    child.on("message", (m) => {
      if (["auth-setup", "measured-load", "complete"].includes(m?.phase))
        phase = m.phase;
    });
    const exit = await new Promise((done, reject) => {
      child.once("error", reject);
      child.once("exit", done);
    });
    const partialPath = resolve(
      clientDir,
      `sprint1-remote-results-${bundle.runId}.json`,
    );
    if (existsSync(partialPath)) {
      const partial = JSON.parse(readFileSync(partialPath));
      writeFileSync(
        resolve(out, "client.json"),
        JSON.stringify(partial, null, 2),
      );
    }
    assert.equal(
      exit,
      0,
      "Client failed; preserve sanitized report and private log",
    );
  } finally {
    closeSync(fd);
    clearInterval(monitor);
    sample();
  }
  const client = JSON.parse(
    readFileSync(
      resolve(clientDir, `sprint1-remote-results-${bundle.runId}.json`),
    ),
  );
  // The owned portable client reports only timings/status; no cookie/password.
  assert.equal(client.runId, bundle.runId);
  assert.equal(client.expectedSource, release.sha);
  assert.equal(client.clientSha256, preparation.clientSha256);
  assert.equal(client.rounds.length, 10);
  for (const round of client.rounds) {
    assert.equal(round.responses.length, 200);
    assert.equal(round.success, 100);
    assert.equal(round.conflict, 100);
    assert.equal(round.allOverlap, true);
    assert(round.responses.every((r) => [200, 409].includes(r.status)));
  }
  writeFileSync(resolve(out, "client.json"), JSON.stringify(client, null, 2));
  const req = createRequire(resolve(root, "apps/api/package.json")),
    { PrismaClient } = req("@prisma/client"),
    { PrismaPg } = req("@prisma/adapter-pg");
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: `postgresql://${c.user}:${c.dbPassword}@127.0.0.1:15455/${c.database}?schema=public`,
    }),
  });
  try {
    const users = await db.user.findMany({
      where: { email: { in: bundle.accounts.map((a) => a.email) } },
      select: {
        id: true,
        email: true,
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    assert.equal(users.length, 200);
    assert(
      users.every(
        (u) => u.userRoles.length === 1 && u.userRoles[0].role.name === "BUYER",
      ),
    );
    const userId = new Map(users.map((u) => [u.email, u.id])),
      holds = await db.seatHold.findMany({
        where: { seatId: { in: bundle.seats } },
        select: {
          seatId: true,
          expiresAt: true,
          holdSession: { select: { userId: true } },
        },
      });
    assert.equal(holds.length, 1000);
    for (const hold of holds) {
      const seatIndex = bundle.seats.indexOf(hold.seatId) % 100,
        owners = [0, 100].map((offset) =>
          userId.get(bundle.accounts[seatIndex + offset].email),
        );
      assert(owners.includes(hold.holdSession.userId));
      assert(hold.expiresAt > new Date());
    }
    report.database = {
      buyerUsers: 200,
      activeDistinctSeatRights: holds.length,
      ownershipPairsCorrect: true,
      rounds: Array.from({ length: 10 }, (_, round) => ({
        round,
        activeRights: holds.filter((h) =>
          bundle.seats.slice(round * 100, (round + 1) * 100).includes(h.seatId),
        ).length,
      })),
      durability:
        await db.$queryRaw`SELECT current_setting('fsync') AS fsync,current_setting('synchronous_commit') AS synchronous_commit,version() AS version`,
    };
  } finally {
    await db.$disconnect();
  }
  assert.equal(active().sha, release.sha);
  assert.equal(await health(), 200);
  report.after = snapshot();
  report.gatewaySha256 = createHash("sha256")
    .update(readFileSync(resolve(root, "deploy/laptop-gateway.mjs")))
    .digest("hex");
  report.clientMetrics = client.generatorMetrics;
  report.sourceUnchanged = true;
  report.correctness = "PASS";
  report.allP95Ms = client.allP95Ms;
  report.nfrResult =
    client.allP95Ms < 300
      ? "PASS in this one-laptop/protocol configuration"
      : "FAIL";
  report.completedAt = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      source: release.sha,
      protocol: report.protocol,
      correctness: report.correctness,
      nfr: report.nfrResult,
      allP95Ms: report.allP95Ms,
      rawResponses: 2000,
    }),
  );
  if (report.allP95Ms >= 300) process.exitCode = 1;
} catch (error) {
  report.result = "FAIL";
  report.error = error.code ?? error.message;
  save();
  throw Error("Load run failed; preserved evidence/private logs");
} finally {
  clearInterval(monitor);
}
