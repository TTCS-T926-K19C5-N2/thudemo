// Portable Node24 client: only built-in modules; no DB/admin credentials.
import https from "node:https";
import { connect } from "node:http2";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, X509Certificate } from "node:crypto";
import assert from "node:assert/strict";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { cpus, totalmem } from "node:os";
const dir = resolve(import.meta.dirname),
  bundle = JSON.parse(
    readFileSync(resolve(dir, "sprint1-remote-benchmark.json")),
  ),
  cert = new X509Certificate(readFileSync(resolve(dir, "server-cert.cer")));
assert.equal(cert.fingerprint256, bundle.certificateSha256);
assert.equal(bundle.profile, "sprint1-laptop-20261015");
const target = new URL(bundle.origin);
assert(
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(
    target.hostname,
  ) &&
    target.hostname.split(".").every((n) => Number(n) <= 255) &&
    !target.username &&
    !target.password &&
    target.pathname === "/" &&
    !target.search &&
    !target.hash,
  "Only the pinned private LAN staging origin is allowed",
);
assert.equal(new URL(bundle.origin).protocol, "https:");
assert.equal(new URL(bundle.origin).port, "3470");
assert.equal(bundle.accounts.length, 200);
assert.equal(bundle.seats.length, 1000);
const ca = cert.toString(),
  protocol = process.argv.includes("--http1") ? "HTTP1.1" : "HTTP2",
  report = {
    runId: bundle.runId,
    expectedSource: bundle.source,
    clientSha256: createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex"),
    startedAt: new Date().toISOString(),
    protocol,
    node: process.version,
    origin: bundle.origin,
    scenario:
      "200 authenticated buyers/100seats,10disjoint rounds,2000complete responses; all latency includes first TLS",
    thresholdMs: 300,
    rounds: [],
    environment: {
      platform: process.platform,
      cpu: cpus()[0].model,
      memoryBytes: totalmem(),
      generator:
        "Separate Node process; hardware location established by laptop orchestrator",
    },
  };
const phase = (name) => {
  process.send?.({ phase: name });
};
let cpuBefore, eluBefore, loadStarted;
const loop = monitorEventLoopDelay({ resolution: 10 });
const output = resolve(dir, `sprint1-remote-results-${bundle.runId}.json`),
  save = () => writeFileSync(output, JSON.stringify(report, null, 2));
assert(
  !existsSync(output),
  "Refuse to overwrite a prior run; prepare new fixtures",
);
let h2;
const authAgent = new https.Agent({
    ca,
    keepAlive: true,
    rejectUnauthorized: true,
  }),
  loadAgent = new https.Agent({
    ca,
    keepAlive: true,
    maxSockets: 200,
    rejectUnauthorized: true,
  });
const percentile = (xs) =>
  [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];
async function login(account) {
  return new Promise((done, reject) => {
    const r = https.request(
      bundle.origin + "/api/auth/login",
      {
        agent: authAgent,
        method: "POST",
        timeout: 30000,
        headers: { origin: bundle.origin, "content-type": "application/json" },
      },
      (res) => {
        res.resume();
        res.once("end", () => {
          if (res.statusCode !== 200)
            return reject(Error(`Fixture login status${res.statusCode}`));
          done(res.headers["set-cookie"]?.[0]?.split(";")[0]);
        });
      },
    );
    r.once("error", reject);
    r.once("timeout", () => r.destroy(Error("Login deadline")));
    r.end(JSON.stringify({ email: account.email, password: account.password }));
  });
}
async function hold(seatId, cookie) {
  const start = performance.now(),
    startedUnixMs = performance.timeOrigin + start;
  return new Promise((done) => {
    const finish = (status, error) =>
      done({
        status,
        ms: performance.now() - start,
        startedUnixMs,
        ...(error ? { error } : {}),
      });
    if (protocol === "HTTP2") {
      if (!h2) {
        h2 = connect(bundle.origin, {
          ca,
          rejectUnauthorized: true,
          servername: "",
        });
        h2.on("error", () => {});
        h2.once("connect", () => {
          report.localAddress = h2.socket.localAddress;
        });
        h2.once("remoteSettings", (settings) => {
          report.serverMaxConcurrentStreams = settings.maxConcurrentStreams;
        });
      }
      const stream = h2.request({
        ":method": "POST",
        ":path": `/api/showtimes/${bundle.showtimeId}/holds`,
        origin: bundle.origin,
        cookie,
        "content-type": "application/json",
      });
      let status = 0;
      stream.once(
        "response",
        (headers) => (status = Number(headers[":status"])),
      );
      stream.resume();
      stream.once("end", () => finish(status));
      stream.once("error", (e) => finish(0, e.code ?? e.name));
      stream.setTimeout(30000, () => stream.destroy(Error("Load deadline")));
      stream.end(JSON.stringify({ seatIds: [seatId] }));
    } else {
      const request = https.request(
        bundle.origin + `/api/showtimes/${bundle.showtimeId}/holds`,
        {
          agent: loadAgent,
          method: "POST",
          timeout: 30000,
          headers: {
            origin: bundle.origin,
            cookie,
            "content-type": "application/json",
          },
        },
        (res) => {
          res.resume();
          res.once("end", () => finish(res.statusCode));
          res.once("error", (e) => finish(0, e.code ?? e.name));
        },
      );
      request.once("error", (e) => finish(0, e.code ?? e.name));
      request.once("timeout", () => request.destroy(Error("Load deadline")));
      request.end(JSON.stringify({ seatIds: [seatId] }));
    }
  });
}
try {
  phase("auth-setup");
  const setupStarted = performance.now();
  // Setup login traffic is separate, exactly as in the laptop harness. Its
  // agent is discarded; the measured load uses a new cold TLS connection(s).
  const cookies = [];
  for (const account of bundle.accounts) cookies.push(await login(account));
  authAgent.destroy();
  report.setup = {
    successfulApiLogins: cookies.length,
    milliseconds: performance.now() - setupStarted,
    loadAgentIsNew: true,
    holdWarmupRequests: 0,
  };
  phase("measured-load");
  cpuBefore = process.cpuUsage();
  eluBefore = performance.eventLoopUtilization();
  loadStarted = performance.now();
  loop.enable();
  for (let round = 0; round < 10; round++) {
    const ids = bundle.seats.slice(round * 100, (round + 1) * 100),
      responses = await Promise.all(
        cookies.map((cookie, index) => hold(ids[index % 100], cookie)),
      );
    const success = responses.filter((x) => x.status === 200).length,
      conflict = responses.filter((x) => x.status === 409).length;
    const allOverlap =
      Math.max(...responses.map((x) => x.startedUnixMs)) <
      Math.min(...responses.map((x) => x.startedUnixMs + x.ms));
    report.rounds.push({
      round,
      success,
      conflict,
      allOverlap,
      p95Ms: percentile(responses.map((x) => x.ms)),
      responses,
    });
    save();
    assert.equal(success, 100);
    assert.equal(conflict, 100);
    assert(allOverlap, "All200requests must overlap before first completion");
  }
  const samples = report.rounds.flatMap((r) => r.responses.map((x) => x.ms));
  report.allP95Ms = percentile(samples);
  report.steadyP95Ms = percentile(samples.slice(200));
  report.correctness = "PASS client side; server DB correlation still required";
  report.nfr = report.allP95Ms < 300 ? "PASS client side only" : "FAIL";
  report.completedAt = new Date().toISOString();
  loop.disable();
  report.generatorMetrics = {
    cpu: process.cpuUsage(cpuBefore),
    wallMs: performance.now() - loadStarted,
    eventLoopUtilization:
      performance.eventLoopUtilization(eluBefore).utilization,
    eventLoopDelayP95Ms: loop.percentile(95) / 1e6,
    eventLoopDelayMaxMs: loop.max / 1e6,
    maxRssKiB: process.resourceUsage().maxRSS,
  };
  phase("complete");
  save();
  console.log(
    `Client complete: allp95=${report.allP95Ms.toFixed(2)}ms; copy ${output} to laptop incoming for DB/source correlation.`,
  );
} catch (error) {
  report.result = "FAIL";
  report.error = error.code ?? error.message;
  report.completedAt = new Date().toISOString();
  save();
  throw Error(
    "Client failed; sanitized result was saved. No account/password/token is logged.",
  );
} finally {
  authAgent.destroy();
  loadAgent.destroy();
  h2?.close();
}
