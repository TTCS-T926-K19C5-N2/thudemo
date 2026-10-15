import https from "node:https";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { stagingConfig, stagingRelease } from "../deploy/laptop-gateway.mjs";
import {
  signLoginPeer,
  LOGIN_PEER_HEADER,
} from "../packages/shared/login-peer.js";
const root = resolve(import.meta.dirname, ".."),
  dir = resolve(root, ".sprint1-staging");
const c = stagingConfig(JSON.parse(readFileSync(resolve(dir, "config.json"))));
const active = stagingRelease(
  JSON.parse(readFileSync(resolve(dir, "active.json"))),
);
const req = createRequire(resolve(root, "apps/api/package.json"));
const { PrismaClient } = req("@prisma/client"),
  { PrismaPg } = req("@prisma/adapter-pg"),
  Redis = req("ioredis").default;
const dbURL = `postgresql://${c.user}:${c.dbPassword}@127.0.0.1:${c.pgPort}/${c.database}?schema=public`;
const target = new URL(dbURL);
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "15455" ||
  target.pathname !== "/sprint1_staging_20261015"
)
  throw new Error("Only isolated staging fixtures allowed");
const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: dbURL }),
  }),
  redis = new Redis(c.redisPort, "127.0.0.1");
const origin = `https://${c.lanAddress}:${c.gatewayPort}`,
  ca = readFileSync(resolve(dir, "tls/server-cert.pem"));
const results = [];
const out = resolve(root, "evidence/sprint1/20261015-laptop");
mkdirSync(out, { recursive: true });
function record(name, details = {}) {
  results.push({
    name,
    source: JSON.parse(readFileSync(resolve(dir, "active.json"))).sha,
    status: details.status ?? "PASS",
    ...details,
  });
  writeFileSync(
    resolve(out, "https-api.json"),
    JSON.stringify(
      {
        startedSource: active.sha,
        origin,
        transport:
          "Real HTTPS, certificate and hostname verified using this exact staging certificate as trust anchor",
        results,
        limitations: [
          "Not an independent second-device test",
          "Browser/system trust still requires OS confirmation",
          "Manual candidate deployment does not prove develop auto-deploy AC",
        ],
      },
      null,
      2,
    ),
  );
  console.log(details.status ?? "PASS", name);
}
async function call(
  path,
  { method = "GET", body, cookie, peer, headers = {} } = {},
) {
  return await new Promise((done, reject) => {
    const request = https.request(
      {
        hostname: c.lanAddress,
        port: c.gatewayPort,
        path,
        method,
        ca,
        rejectUnauthorized: true,
        localAddress: peer,
        timeout: 15000,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          origin,
          ...headers,
        },
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => {
          let json;
          try {
            json = JSON.parse(text);
          } catch {}
          done({
            status: response.statusCode,
            headers: response.headers,
            json,
            text,
          });
        });
      },
    );
    request.once("error", reject);
    request.once("timeout", () =>
      request.destroy(new Error("TLS request timeout")),
    );
    request.end(body ? JSON.stringify(body) : undefined);
  });
}
const account = (name) =>
  c.accounts.find((a) => a.email.startsWith(name + "@"));
async function login(name, options = {}) {
  const response = await call("/api/auth/login", {
    method: "POST",
    body: account(name),
    ...options,
  });
  assert.equal(response.status, 200);
  return response.headers["set-cookie"][0].split(";")[0];
}
try {
  if (
    existsSync(resolve(out, "https-api.json")) &&
    !existsSync(resolve(out, "https-api-initial.json"))
  )
    copyFileSync(
      resolve(out, "https-api.json"),
      resolve(out, "https-api-initial.json"),
    );
  assert.equal((await call("/")).status, 200);
  assert.equal((await call("/api/health")).status, 200);
  assert.equal((await call("/api/auth/me")).status, 401);
  record("https-home-health-anonymous401");
  const raw = await call("/api/auth/login", {
    method: "POST",
    body: account("organizer-a"),
  });
  assert.equal(raw.status, 200);
  for (const flag of [/HttpOnly/, /Secure/, /SameSite=Lax/, /Max-Age=900/])
    assert.match(raw.headers["set-cookie"][0], flag);
  record("production-secure-cookie-contract");
  const a = await login("organizer-a"),
    b = await login("organizer-b"),
    buyer = await login("buyer");
  const draft = {
    name: "LAN Sprint1 " + Date.now(),
    description: "Synthetic staging acceptance only",
    location: "LAN demo room",
  };
  const created = await call("/api/events", {
    method: "POST",
    body: draft,
    cookie: a,
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.status, "DRAFT");
  const id = created.json.id;
  const listed = await call("/api/events", { cookie: buyer });
  assert.equal(listed.status, 200);
  assert(!JSON.stringify(listed.json).includes(id));
  record("organizer-draft-created-and-hidden-from-buyer");
  assert.equal(
    (await call(`/api/events/${id}/manage`, { cookie: b })).status,
    403,
  );
  assert.equal(
    (
      await call(`/api/events/${id}`, {
        method: "PATCH",
        cookie: b,
        body: draft,
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/events", { method: "POST", cookie: buyer, body: draft }))
      .status,
    403,
  );
  record("owner-b-and-buyer-server403");
  assert.equal(
    (
      await call(`/api/events/${id}`, {
        method: "PATCH",
        cookie: a,
        body: { ...draft, location: "Updated LAN room" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(`/api/events/${id}/manage`, { cookie: a })).json.location,
    "Updated LAN room",
  );
  record("event-edit-readback-persists");
  assert.equal(
    (
      await call(`/api/events/${id}/showtimes`, {
        method: "POST",
        cookie: a,
        body: { startTime: "2000-01-01T00:00:00.000Z" },
      })
    ).status,
    400,
  );
  const utc = "2098-12-31T17:30:00.000Z";
  for (let n = 0; n < 2; n++) {
    const response = await call(`/api/events/${id}/showtimes`, {
      method: "POST",
      cookie: a,
      body: { startTime: utc },
    });
    assert.equal(response.status, 201);
    if (n === 1) assert.match(response.json.warning, /cùng giờ/);
  }
  const times = await db.showtime.findMany({ where: { eventId: id } });
  assert.equal(times.length, 2);
  assert(times.every((t) => t.startTime.toISOString() === utc));
  await assert.rejects(db.event.delete({ where: { id } }));
  record("future-past-duplicate-warning-utc-storage-and-fk-restrict");
  assert.equal(
    (await call("/api/auth/logout", { method: "POST", cookie: a })).status,
    200,
  );
  assert.equal((await call("/api/auth/me", { cookie: a })).status, 401);
  const expired = await login("organizer-a"),
    token = expired.split("=")[1];
  await db.session.update({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await call("/api/auth/me", { cookie: expired })).status, 401);
  record("logout-replay-and-server-expired-session401");
  const lock = account("lock-test"),
    lockKey =
      "auth:lock:" + createHash("sha256").update(lock.email).digest("hex");
  const existingLock = await redis.ttl(lockKey);
  if (existingLock <= 0)
    for (let n = 0; n < 5; n++)
      assert.equal(
        (
          await call("/api/auth/login", {
            method: "POST",
            body: { ...lock, password: "incorrect-fixture-only" },
          })
        ).status,
        401,
      );
  assert.equal(
    (await call("/api/auth/login", { method: "POST", body: lock })).status,
    429,
  );
  const ttl = await redis.ttl(lockKey);
  assert(ttl > 0 && ttl <= 900);
  record(
    existingLock <= 0
      ? "five-failures-sixth429-real900s-policy"
      : "existing-fixture-lock-still429-policy-not-shortened",
    {
      remainingSeconds: ttl,
      failuresExecutedThisRun: existingLock <= 0 ? 5 : 0,
    },
  );
  const inspect = spawnSync("docker", ["inspect", active.apiContainer], {
    encoding: "utf8",
    windowsHide: true,
  });
  const container = JSON.parse(inspect.stdout)[0];
  assert.equal(container.Config.Labels["sprint1.staging"], "20261015");
  assert.equal(
    spawnSync("docker", ["restart", active.apiContainer], {
      stdio: "ignore",
      windowsHide: true,
    }).status,
    0,
  );
  for (let n = 0; n < 90; n++) {
    try {
      if ((await call("/api/health")).status === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(
    (await call("/api/auth/login", { method: "POST", body: lock })).status,
    429,
  );
  record("owned-api-restart-retains-account-lock-in-redis");
  const actualKey =
      "auth:ip-fail:" + createHash("sha256").update(c.lanAddress).digest("hex"),
    before = Number((await redis.get(actualKey)) ?? 0);
  assert.equal(
    (
      await call("/api/Auth/LOGIN", {
        method: "POST",
        body: {
          email: `alias-${randomUUID()}@sprint1.staging.invalid`,
          password: "incorrect-fixture-only",
        },
        headers: {
          "x-forwarded-for": "192.0.2.250",
          [LOGIN_PEER_HEADER]: signLoginPeer("192.0.2.250", c.authProxySecret),
        },
      })
    ).status,
    401,
  );
  assert.equal(Number(await redis.get(actualKey)), before + 1);
  record(
    "https-case-alias-charges-actual-lan-peer-despite-spoofed-valid-attestation",
  );
  const peer = "127.22." + (Math.floor(Math.random() * 200) + 1) + ".20",
    other = peer.replace(/\.20$/, ".21");
  const peerKey =
    "auth:ip-fail:" + createHash("sha256").update(peer).digest("hex");
  try {
    for (let n = 0; n < 30; n++)
      assert.equal(
        (
          await call(n % 2 ? "/api/Auth/LOGIN" : "/api/auth/login", {
            method: "POST",
            peer,
            body: {
              email: `ip-${randomUUID()}@sprint1.staging.invalid`,
              password: "incorrect-fixture-only",
            },
            headers: {
              "x-forwarded-for": `192.0.2.${n + 1}`,
              [LOGIN_PEER_HEADER]: signLoginPeer(
                "192.0.2.250",
                c.authProxySecret,
              ),
            },
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await call("/api/Auth/LOGIN", {
          method: "POST",
          peer,
          body: account("organizer-a"),
          headers: { "x-forwarded-for": "192.0.2.251" },
        })
      ).status,
      429,
    );
    assert((await redis.ttl(peerKey)) > 800);
    await login("organizer-a", { peer: other });
    record(
      "tls-actual-two-tcp-peers-casing-alias-spoof-resistant-shared-budget",
      {
        peerCounterTTL: await redis.ttl(peerKey),
        limitation:
          "Two TCP source addresses on this host; second Wi-Fi device still NOT RUN",
      },
    );
  } catch (error) {
    if (!["ENETUNREACH", "EADDRNOTAVAIL"].includes(error.code)) throw error;
    record("tls-independent-peer-network-routing", {
      status: "BLOCKED",
      reason: error.code,
      detail:
        "Windows cannot route this loopback source to the LAN listener; requires a second real Wi-Fi client. No header spoof used as substitute.",
    });
  }
  if (process.argv.includes("--wait-natural-expiry")) {
    let remaining = await redis.ttl(lockKey);
    while (remaining > 0) {
      await new Promise((r) =>
        setTimeout(r, Math.min(remaining * 1000 + 100, 30000)),
      );
      remaining = await redis.ttl(lockKey);
    }
    assert.equal(
      (await call("/api/auth/login", { method: "POST", body: lock })).status,
      200,
    );
    record("natural-lock-expiry-valid-login200-no-del-no-shortened-ttl");
  } else
    record("natural-lock-expiry-check-deferred", {
      status: "NOT RUN",
      remainingSeconds: await redis.ttl(lockKey),
    });
} finally {
  await db.$disconnect();
  redis.disconnect();
}
