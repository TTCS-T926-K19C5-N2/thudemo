import https from "node:https";
import { connect as connectHttp2 } from "node:http2";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import {
  randomBytes,
  randomUUID,
  createHash,
  X509Certificate,
} from "node:crypto";
import { cpus, totalmem } from "node:os";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { stagingConfig, stagingRelease } from "../deploy/laptop-gateway.mjs";

// Bounded, additive synthetic fixtures only. Never relax another suite's DB guard.
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, ".sprint1-staging");
const c = stagingConfig(JSON.parse(readFileSync(resolve(dir, "config.json"))));
const release = stagingRelease(
  JSON.parse(readFileSync(resolve(dir, "active.json"))),
);
if (!process.argv.includes("--create-synthetic-fixtures"))
  throw new Error("Explicit synthetic-fixture flag required");
const req = createRequire(resolve(root, "apps/api/package.json"));
const { PrismaClient } = req("@prisma/client");
const { PrismaPg } = req("@prisma/adapter-pg");
const argon2 = req("argon2");
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: `postgresql://${c.user}:${c.dbPassword}@127.0.0.1:${c.pgPort}/${c.database}?schema=public`,
  }),
});
const origin = `https://${c.lanAddress}:${c.gatewayPort}`;
const ca = readFileSync(resolve(dir, "tls/server-cert.pem"));
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 200,
  ca,
  rejectUnauthorized: true,
});
const useHttp2 = process.argv.includes("--http2");
const apiLogins = process.argv.includes("--api-login-fixtures");
const prepareRemote = process.argv.includes("--prepare-remote");
const parallelClients = process.argv.includes("--four-clients");
if (parallelClients && useHttp2)
  throw Error("Four-client mode is HTTP1.1 only");
const clients = [];
let h2, h2Ready;
const runId = randomUUID();
const report = {
  source: release.sha,
  runId,
  startedAt: new Date().toISOString(),
  origin,
  environment: {
    node: process.version,
    cpu: cpus()[0].model,
    logicalCPUs: cpus().length,
    memoryBytes: totalmem(),
    apiInstances: release.apiReplicaPort ? 2 : 1,
    gatewaySourceSha256: createHash("sha256")
      .update(readFileSync(resolve(root, "deploy/laptop-gateway.mjs")))
      .digest("hex"),
    protocol: useHttp2
      ? "h2;200concurrent streams; cold TLS establishment included in first-round requests"
      : "HTTP/1.1;200concurrent connections",
    generator: parallelClients
      ? "four isolated client processes on the same laptop,50concurrent requests each,200total; no excluded warmup"
      : "same laptop as staging services; one client process",
    tls: "exact certificate CA and hostname verified",
  },
  scenario:
    "200 authenticated buyers / 100 contested seats per round; 10 disjoint rounds, 2000 real HTTPS endpoint calls",
  auth: "Synthetic users have Argon2id hashes; DB-issued fixture sessions have SHA256 tokens and 900s expiry. Login latency excluded.",
  thresholdMs: 300,
  rounds: [],
  limitations: [
    "API instance count is recorded above; co-located load generator, not an independent-device performance environment.",
    "No expiry worker/restart/durability claim from this measurement.",
    "Does not replace PostgreSQL-versus-Redis datastore comparison or full Sprint 2 acceptance.",
    "Additive fake fixtures remain; no reset, history deletion or modification of existing users/holds.",
  ],
};
const at = process.argv.indexOf("--output");
if (prepareRemote && at < 0)
  throw Error("Explicit new evidence output required for remote preparation");
const output = resolve(
  root,
  at < 0
    ? "evidence/sprint1/20261015-laptop/endpoint-benchmark.json"
    : process.argv[at + 1],
);
if (
  !output.startsWith(resolve(root, "evidence/sprint1") + "/") &&
  !output.startsWith(resolve(root, "evidence/sprint1") + "\\")
)
  throw Error("Benchmark evidence must stay within Sprint 1 directory");
if (existsSync(output))
  throw Error("Refuse to overwrite a prior benchmark; choose a new output");
function save() {
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
}
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}
async function holdHttp2(showtimeId, seatId, cookie) {
  const started = performance.now(),
    timings = {};
  if (!h2) {
    h2 = connectHttp2(origin, { ca, rejectUnauthorized: true, servername: "" });
    h2.on("error", () => {});
    h2Ready = new Promise((done) => h2.once("connect", done));
  }
  return await new Promise((done) => {
    const connecting = h2.connecting;
    if (connecting)
      h2Ready.then(() => {
        timings.tlsMs = performance.now() - started;
      });
    const stream = h2.request({
      ":method": "POST",
      ":path": `/api/showtimes/${showtimeId}/holds`,
      origin,
      cookie,
      "content-type": "application/json",
    });
    let status = 0;
    stream.once("response", (headers) => {
      status = Number(headers[":status"]);
      timings.ttfbMs = performance.now() - started;
    });
    stream.resume();
    stream.once("end", () =>
      done({ status, ms: performance.now() - started, timings }),
    );
    stream.once("error", (error) =>
      done({
        status: 0,
        error: error.code ?? error.name,
        ms: performance.now() - started,
        timings,
      }),
    );
    stream.setTimeout(30000, () =>
      stream.destroy(new Error("HTTP2 request timeout")),
    );
    stream.end(JSON.stringify({ seatIds: [seatId] }));
  });
}
async function hold(showtimeId, seatId, cookie) {
  if (useHttp2) return holdHttp2(showtimeId, seatId, cookie);
  const started = performance.now();
  const timings = {};
  return await new Promise((done) => {
    const request = https.request(
      `${origin}/api/showtimes/${showtimeId}/holds`,
      {
        agent,
        method: "POST",
        timeout: 30000,
        headers: { origin, cookie, "content-type": "application/json" },
      },
      (response) => {
        timings.ttfbMs = performance.now() - started;
        response.resume();
        response.once("end", () =>
          done({
            status: response.statusCode,
            ms: performance.now() - started,
            timings,
          }),
        );
        response.once("error", (error) =>
          done({
            status: 0,
            error: error.code ?? error.name,
            ms: performance.now() - started,
            timings,
          }),
        );
      },
    );
    request.once("socket", (socket) => {
      timings.socketAssignedMs = performance.now() - started;
      timings.reusedSocket = !socket.connecting;
      if (socket.connecting) {
        socket.once("lookup", () => {
          timings.lookupMs = performance.now() - started;
        });
        socket.once("connect", () => {
          timings.connectMs = performance.now() - started;
        });
        socket.once("secureConnect", () => {
          timings.tlsMs = performance.now() - started;
        });
      }
    });
    request.once("error", (error) =>
      done({
        status: 0,
        error: error.code ?? error.name,
        ms: performance.now() - started,
        timings,
      }),
    );
    request.once("timeout", () =>
      request.destroy(new Error("Benchmark HTTPS timeout")),
    );
    request.end(JSON.stringify({ seatIds: [seatId] }));
  });
}
async function apiCookie(email, password) {
  return new Promise((done, reject) => {
    const r = https.request(
      origin + "/api/auth/login",
      {
        agent,
        method: "POST",
        timeout: 30000,
        headers: { origin, "content-type": "application/json" },
      },
      (res) => {
        res.resume();
        res.once("end", () =>
          res.statusCode === 200
            ? done(res.headers["set-cookie"][0].split(";")[0])
            : reject(Error("Fixture login failed")),
        );
      },
    );
    r.once("error", reject);
    r.once("timeout", () => r.destroy(Error("Fixture login deadline")));
    r.end(JSON.stringify({ email, password }));
  });
}

try {
  const owner = await db.user.findUniqueOrThrow({
    where: {
      email: c.accounts.find((a) => a.email.startsWith("organizer-a@")).email,
    },
  });
  const role = await db.role.findUniqueOrThrow({ where: { name: "BUYER" } });
  const passwordPlain = randomBytes(32).toString("hex");
  const password = await argon2.hash(passwordPlain, {
    type: argon2.argon2id,
  });
  const buyers = [];
  for (let n = 0; n < 200; n++) {
    const token = randomBytes(32).toString("base64url");
    await db.user.create({
      data: {
        email: `benchmark-${runId}-${n}@sprint1.staging.invalid`,
        password,
        isEmailVerified: true,
        userRoles: { create: { roleId: role.id } },
        sessions: {
          create: {
            tokenHash: createHash("sha256").update(token).digest("hex"),
            expiresAt: new Date(Date.now() + 900000),
          },
        },
      },
    });
    buyers.push(`event_session=${token}`);
  }
  const event = await db.event.create({
    data: {
      name: `Synthetic NFR ${runId}`,
      description: "Bounded staging benchmark fixture",
      location: "Synthetic only",
      organizerId: owner.id,
    },
  });
  const show = await db.showtime.create({
    data: {
      eventId: event.id,
      startTime: new Date("2099-01-01T12:00:00Z"),
      status: "ON_SALE",
      structureLocked: true,
      seatMapId: randomUUID(),
      // Isolate hold contention from the existing S-42 per-buyer quota.
      // NULL is that feature's supported unlimited value, for this new fixture only.
      maxTicketsPerUser: null,
    },
  });
  const category = await db.seatCategory.create({
    data: { showtimeId: show.id, name: "Benchmark", price: 120000 },
  });
  const seats = Array.from({ length: 1000 }, (_, n) => ({
    id: randomUUID(),
    showtimeId: show.id,
    categoryId: category.id,
    row: `R${Math.floor(n / 50)}`,
    seatNumber: (n % 50) + 1,
  }));
  await db.seat.createMany({ data: seats });
  report.fixture = {
    eventId: event.id,
    showtimeId: show.id,
    users: 200,
    seats: 1000,
    eventStatus: "DRAFT (kept out of buyer catalog)",
  };
  save();
  if (prepareRemote) {
    const remoteDir = resolve(dir, "load-runs", runId);
    mkdirSync(remoteDir, { recursive: true });
    const bundle = {
      profile: c.profile,
      runId,
      source: release.sha,
      origin,
      showtimeId: show.id,
      seats: seats.map((s) => s.id),
      certificateSha256: new X509Certificate(ca).fingerprint256,
      accounts: Array.from({ length: 200 }, (_, n) => ({
        email: `benchmark-${runId}-${n}@sprint1.staging.invalid`,
        password: passwordPlain,
      })),
    };
    writeFileSync(
      resolve(remoteDir, "sprint1-remote-benchmark.json"),
      JSON.stringify(bundle, null, 2),
      { flag: "wx" },
    );
    copyFileSync(
      resolve(dir, "tls/server-cert.cer"),
      resolve(remoteDir, "server-cert.cer"),
    );
    copyFileSync(
      resolve(root, "scripts/sprint1-staging-load-client.mjs"),
      resolve(remoteDir, "sprint1-staging-load-client.mjs"),
    );
    report.result = "PREPARED / NOT RUN";
    report.remoteDirectory = remoteDir;
    report.clientSha256 = createHash("sha256")
      .update(
        readFileSync(resolve(remoteDir, "sprint1-staging-load-client.mjs")),
      )
      .digest("hex");
    save();
    console.log("Private buyer-only load bundle prepared at " + remoteDir);
  } else {
    if (apiLogins) {
      const started = performance.now();
      for (let n = 0; n < 200; n++)
        buyers[n] = await apiCookie(
          `benchmark-${runId}-${n}@sprint1.staging.invalid`,
          passwordPlain,
        );
      agent.destroy();
      report.auth =
        "200 successful real HTTPS API logins; fresh measured load connections (no hold warmup); login latency outside endpoint holds";
      report.authSetupMs = performance.now() - started;
      save();
    }
    const samples = [];
    if (parallelClients) {
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          const child = fork(
            new URL("./staging-benchmark-client.mjs", import.meta.url),
            [],
            { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true },
          );
          clients.push(child);
          await new Promise((done, reject) => {
            child.once("error", reject);
            child.once("exit", () =>
              reject(Error("Client exited before ready")),
            );
            child.once("message", (m) =>
              m.type === "ready" ? done() : reject(Error("Client protocol")),
            );
            child.send({ type: "configure", origin, ca: ca.toString() });
          });
        }),
      );
    }
    for (let round = 0; round < 10; round++) {
      assert.equal(
        JSON.parse(readFileSync(resolve(dir, "active.json"))).sha,
        release.sha,
        "Source must remain fixed during measurement",
      );
      const ids = seats.slice(round * 100, (round + 1) * 100).map((s) => s.id);
      const dispatch = performance.timeOrigin + performance.now();
      const responses = parallelClients
        ? (
            await Promise.allSettled(
              clients.map(
                (child, clientIndex) =>
                  new Promise((done, reject) => {
                    const onMessage = (m) => {
                      if (m.type === "result") {
                        child.removeListener("exit", onExit);
                        done(m.responses);
                      }
                    };
                    const onExit = () => {
                      child.removeListener("message", onMessage);
                      reject(Error("Client exited during round"));
                    };
                    child.once("message", onMessage);
                    child.once("exit", onExit);
                    child.send({
                      type: "round",
                      requests: buyers
                        .slice(clientIndex * 50, (clientIndex + 1) * 50)
                        .map((cookie, index) => ({
                          cookie,
                          path: `/api/showtimes/${show.id}/holds`,
                          seatId: ids[(clientIndex * 50 + index) % 100],
                        })),
                    });
                  }),
              ),
            )
          ).flatMap((result) =>
            result.status === "fulfilled"
              ? result.value
              : Array.from({ length: 50 }, () => ({
                  status: 0,
                  error: "ClientProcessFailure",
                  startedUnixMs: dispatch,
                  ms: performance.timeOrigin + performance.now() - dispatch,
                })),
          )
        : await Promise.all(
            buyers.map((cookie, n) => hold(show.id, ids[n % 100], cookie)),
          );
      const success = responses.filter((r) => r.status === 200).length;
      const conflict = responses.filter((r) => r.status === 409).length;
      const activeHolds = await db.seatHold.count({
        where: { seatId: { in: ids }, expiresAt: { gt: new Date() } },
      });
      const statuses = Object.fromEntries(
        [...new Set(responses.map((r) => r.status))].map((status) => [
          status,
          responses.filter((r) => r.status === status).length,
        ]),
      );
      report.rounds.push({
        round,
        statuses,
        responses,
        success,
        conflict,
        activeHolds,
        p95Ms: percentile(
          responses.map((r) => r.ms),
          0.95,
        ),
      });
      save();
      if (parallelClients)
        assert(
          Math.max(...responses.map((r) => r.startedUnixMs)) <
            Math.min(...responses.map((r) => r.startedUnixMs + r.ms)),
          "All200requests must overlap before first completion",
        );
      assert.equal(success, 100);
      assert.equal(conflict, 100);
      assert.equal(activeHolds, 100);
      samples.push(...responses.map((r) => r.ms));
    }
    report.allP95Ms = percentile(samples, 0.95);
    report.steadyP95Ms = percentile(samples.slice(200), 0.95);
    report.correctness = "PASS";
    report.nfrResult =
      report.allP95Ms < report.thresholdMs
        ? "PASS in this bounded environment only"
        : "FAIL";
    report.completedAt = new Date().toISOString();
    save();
    console.log(
      JSON.stringify({
        source: release.sha,
        correctness: report.correctness,
        nfrResult: report.nfrResult,
        allP95Ms: report.allP95Ms,
        steadyP95Ms: report.steadyP95Ms,
      }),
    );
    if (report.allP95Ms >= report.thresholdMs) process.exitCode = 1;
  }
} catch (error) {
  report.correctness = "FAIL";
  const collected = report.rounds
    .flatMap((round) => round.responses ?? [])
    .map((response) => response.ms);
  report.samplesCollected = collected.length;
  if (collected.length) report.allP95Ms = percentile(collected, 0.95);
  report.error = error.code ?? error.name;
  save();
  throw new Error(
    "Staging benchmark failed; inspect sanitized evidence and private logs",
  );
} finally {
  agent.destroy();
  h2?.close();
  for (const client of clients) client.disconnect();
  await db.$disconnect();
}
