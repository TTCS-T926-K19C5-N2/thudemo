import https from "node:https";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { cpus, totalmem } from "node:os";
import assert from "node:assert/strict";
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
    apiInstances: 1,
    generator: "same laptop as staging services",
    tls: "exact certificate CA and hostname verified",
  },
  scenario:
    "200 authenticated buyers / 100 contested seats per round; 10 disjoint rounds, 2000 real HTTPS endpoint calls",
  auth: "Synthetic users have Argon2id hashes; DB-issued fixture sessions have SHA256 tokens and 900s expiry. Login latency excluded.",
  thresholdMs: 300,
  rounds: [],
  limitations: [
    "One API instance and a co-located load generator; not a two-instance or independent-client acceptance environment.",
    "No expiry worker/restart/durability claim from this measurement.",
    "Does not replace PostgreSQL-versus-Redis datastore comparison or full Sprint 2 acceptance.",
    "Additive fake fixtures remain; no reset, history deletion or modification of existing users/holds.",
  ],
};
const output = resolve(
  root,
  "evidence/sprint1/20261015-laptop/endpoint-benchmark.json",
);
function save() {
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
}
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}
async function hold(showtimeId, seatId, cookie) {
  const started = performance.now();
  return await new Promise((done, reject) => {
    const request = https.request(
      `${origin}/api/showtimes/${showtimeId}/holds`,
      {
        agent,
        method: "POST",
        timeout: 30000,
        headers: { origin, cookie, "content-type": "application/json" },
      },
      (response) => {
        response.resume();
        response.once("end", () =>
          done({
            status: response.statusCode,
            ms: performance.now() - started,
          }),
        );
      },
    );
    request.once("error", reject);
    request.once("timeout", () =>
      request.destroy(new Error("Benchmark HTTPS timeout")),
    );
    request.end(JSON.stringify({ seatIds: [seatId] }));
  });
}
try {
  const owner = await db.user.findUniqueOrThrow({
    where: {
      email: c.accounts.find((a) => a.email.startsWith("organizer-a@")).email,
    },
  });
  const role = await db.role.findUniqueOrThrow({ where: { name: "BUYER" } });
  const password = await argon2.hash(randomBytes(32).toString("hex"), {
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
  const samples = [];
  for (let round = 0; round < 10; round++) {
    assert.equal(
      JSON.parse(readFileSync(resolve(dir, "active.json"))).sha,
      release.sha,
      "Source must remain fixed during measurement",
    );
    const ids = seats.slice(round * 100, (round + 1) * 100).map((s) => s.id);
    const responses = await Promise.all(
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
      success,
      conflict,
      activeHolds,
      p95Ms: percentile(
        responses.map((r) => r.ms),
        0.95,
      ),
    });
    save();
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
} catch (error) {
  report.correctness = "FAIL";
  report.error = error.code ?? error.name;
  save();
  throw new Error(
    "Staging benchmark failed; inspect sanitized evidence and private logs",
  );
} finally {
  agent.destroy();
  await db.$disconnect();
}
