import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  createWriteStream,
} from "node:fs";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, ".."),
  req = createRequire(resolve(root, "apps/api/package.json"));
req("dotenv").config({ path: resolve(root, ".env"), quiet: true });
const c = JSON.parse(readFileSync(resolve(root, ".sprint1-local/config.json")));
let target;
try {
  target = new URL(process.env.DATABASE_URL ?? "");
} catch {
  throw new Error("Invalid local DATABASE_URL configuration");
}
assert(!process.env.REDIS_URL, "Refuse inherited REDIS_URL in API verifier");
assert(
  target.hostname === "127.0.0.1" &&
    target.port === String(c.pgPort) &&
    target.pathname === "/sprint1_gitflow_20261015" &&
    process.env.REDIS_HOST === "127.0.0.1" &&
    process.env.REDIS_PORT === String(c.redisPort),
  "Exact isolated demo database/cache required",
);
const { PrismaClient } = req("@prisma/client"),
  { PrismaPg } = req("@prisma/adapter-pg");
const Redis = req("ioredis").default;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const redis = new Redis(Number(process.env.REDIS_PORT), process.env.REDIS_HOST);
const out = resolve(root, "evidence/sprint1/20261015-gitflow");
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, detail = {}) => {
  results.push({ name, status: "PASS", ...detail });
  console.log("PASS", name);
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 3442;
let child;
function call(
  path,
  { method = "GET", body, cookie, ip = "127.0.0.1", headers = {} } = {},
) {
  return new Promise((done, reject) => {
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        localAddress: ip,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (s) => (data += s));
        res.on("end", () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch {}
          done({ status: res.statusCode, json, headers: res.headers });
        });
      },
    );
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
async function start() {
  await new Promise((done, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(port, "0.0.0.0", () => probe.close(done));
  });
  const logs = createWriteStream(
    resolve(root, ".sprint1-local/api-verification.log"),
    { flags: "a" },
  );
  child = spawn(process.execPath, ["--env-file=../../.env", "dist/main.js"], {
    cwd: resolve(root, "apps/api"),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.pipe(logs);
  child.stderr.pipe(logs);
  for (let n = 0; n < 80; n++) {
    if (child.exitCode !== null)
      throw Error("Owned verification API exited before readiness");
    try {
      if ((await call("/health")).status === 200) return;
    } catch {}
    await delay(250);
  }
  throw Error("Verification API failed startup");
}
async function stop() {
  if (child && child.exitCode === null) {
    const wait = new Promise((r) => child.once("exit", r));
    child.kill();
    await wait;
  }
}
const account = (name) =>
  c.accounts.find((a) => a.email.startsWith(name + "@"));
async function login(a, opts = {}) {
  const r = await call("/auth/login", { method: "POST", body: a, ...opts });
  assert.equal(r.status, 200);
  return r.headers["set-cookie"][0].split(";")[0];
}
try {
  await start();
  assert.equal((await call("/auth/me")).status, 401);
  check("anonymous401");
  const a = account("organizer-a"),
    b = account("organizer-b"),
    buyer = account("buyer");
  const ca = await login(a),
    cb = await login(b),
    cu = await login(buyer),
    cm = await login(account("multi-role"));
  const full = await call("/auth/login", { method: "POST", body: a });
  const rawCookie = full.headers["set-cookie"][0];
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /SameSite=Lax/);
  assert.match(rawCookie, /Max-Age=900/);
  check("session-cookie-contract");
  const payload = {
    name: "Sprint1 API " + Date.now(),
    description: "Dữ liệu giả kiểm nghiệm",
    location: "Phòng thử A",
  };
  const invalid = await call("/events", {
    method: "POST",
    cookie: ca,
    body: { name: "", description: "", location: "" },
  });
  assert.equal(invalid.status, 400);
  assert.equal(Object.keys(invalid.json.errors).length, 3);
  check("field-validation400");
  const created = await call("/events", {
    method: "POST",
    cookie: ca,
    body: payload,
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.status, "DRAFT");
  const id = created.json.id;
  const mine = await call("/events/mine", { cookie: ca });
  assert(mine.json.some((e) => e.id === id));
  assert(!(await call("/events")).json.some((e) => e.id === id));
  assert.equal((await call("/events/" + id)).status, 404);
  check("create-draft-owner-list-public-hidden");
  assert.equal(
    (
      await call("/events/" + id, {
        method: "PATCH",
        cookie: ca,
        body: { ...payload, name: payload.name + " sửa" },
      })
    ).status,
    200,
  );
  assert.match(
    (await call("/events/" + id + "/manage", { cookie: ca })).json.name,
    /sửa$/,
  );
  check("edit-persist-read");
  for (const cookie of [cb, cu]) {
    assert.equal(
      (await call("/events/" + id + "/manage", { cookie })).status,
      403,
    );
    assert.equal(
      (await call("/events/" + id, { method: "PATCH", cookie, body: payload }))
        .status,
      403,
    );
    assert.equal(
      (
        await call("/events/" + id + "/showtimes", {
          method: "POST",
          cookie,
          body: { startTime: "2099-01-01T10:00:00+07:00" },
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (await call("/events", { method: "POST", cookie: cu, body: payload }))
      .status,
    403,
  );
  check("buyer-and-other-organizer-server403");
  assert.equal((await call("/events/mine", { cookie: cm })).status, 200);
  assert.equal((await call("/", { cookie: ca })).status, 403);
  check("multi-role-and-default-deny403");
  const endpoint = "/events/" + id + "/showtimes";
  for (const startTime of ["2020-01-01T10:00:00+07:00", "2099-01-01T10:00"])
    assert.equal(
      (
        await call(endpoint, {
          method: "POST",
          cookie: ca,
          body: { startTime },
        })
      ).status,
      400,
    );
  const startTime = "2099-01-01T00:30:00+07:00";
  const st = await call(endpoint, {
    method: "POST",
    cookie: ca,
    body: { startTime },
  });
  assert.equal(st.status, 201);
  assert.equal(st.json.startTime, "2098-12-31T17:30:00.000Z");
  assert.equal(st.json.eventId, id);
  const dup = await call(endpoint, {
    method: "POST",
    cookie: ca,
    body: { startTime },
  });
  assert.equal(dup.status, 201);
  assert.match(dup.json.warning, /cùng giờ/);
  assert.equal(await db.showtime.count({ where: { eventId: id } }), 2);
  check("past-rejected-utc-roundtrip-duplicate-warning-saved");
  await assert.rejects(db.event.delete({ where: { id } }));
  check("event-delete-fk-restrict-no-history-cascade");
  await assert.rejects(
    db.user.create({ data: { email: a.email, password: "not-inserted" } }),
  );
  const hashes = await db.user.findMany({
    where: { email: { in: c.accounts.map((x) => x.email) } },
    select: { password: true },
  });
  assert.equal(hashes.length, 6);
  assert(hashes.every((u) => u.password.startsWith("$argon2id$")));
  assert.equal(await db.role.count(), 5);
  check("db-unique-five-roles-six-argon2id-fixtures");
  await call("/auth/logout", { method: "POST", cookie: ca });
  assert.equal((await call("/auth/me", { cookie: ca })).status, 401);
  check("logout-replay401");
  const exp = await login(a),
    hash = createHash("sha256").update(exp.split("=")[1]).digest("hex");
  await db.session.update({
    where: { tokenHash: hash },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await call("/auth/me", { cookie: exp })).status, 401);
  check("expired-server-session401-fixture-no-production-ttl-change");
  const no = await call("/auth/login", {
    method: "POST",
    body: {
      email: "unknown-" + Date.now() + "@sprint1.demo.invalid",
      password: "wrong",
    },
  });
  const bad = await call("/auth/login", {
    method: "POST",
    body: { email: b.email, password: "wrong" },
  });
  assert.equal(no.status, 401);
  assert.deepEqual(no.json, bad.json);
  check("unknown-email-and-wrong-password-same-error");
  const lock = account("lock-test");
  const key =
    "auth:lock:" + createHash("sha256").update(lock.email).digest("hex");
  const existing = await redis.ttl(key);
  if (existing <= 0) {
    for (let n = 0; n < 5; n++)
      assert.equal(
        (
          await call("/auth/login", {
            method: "POST",
            body: { email: lock.email, password: "wrong" },
          })
        ).status,
        401,
      );
  }
  const locked = await call("/auth/login", { method: "POST", body: lock });
  assert.equal(locked.status, 429);
  const ttl = await redis.ttl(key);
  assert(ttl > 0 && ttl <= 900);
  check("five-failures-sixth429-real-redis-ttl", { ttlSeconds: ttl });
  writeFileSync(
    resolve(root, ".sprint1-local/lock-start.json"),
    JSON.stringify({
      startedAt: new Date().toISOString(),
      expiresAfterSeconds: ttl,
      key,
    }),
  );
  await stop();
  await start();
  const retained = await call("/auth/login", { method: "POST", body: lock });
  assert.equal(retained.status, 429);
  assert(retained.json.retryAfterSeconds <= ttl);
  check("real-api-process-restart-retains-redis-lock", {
    remainingSeconds: retained.json.retryAfterSeconds,
  });
  for (let n = 0; n < 30; n++)
    assert.equal(
      (
        await call("/auth/login", {
          method: "POST",
          ip: "127.0.0.2",
          body: {
            email: `rotated-${n}-${Date.now()}@sprint1.demo.invalid`,
            password: "wrong",
          },
          headers: { "x-forwarded-for": "127.0.0." + (n + 10) },
        })
      ).status,
      401,
    );
  const blocked = await call("/auth/login", {
    method: "POST",
    ip: "127.0.0.2",
    body: a,
    headers: { "x-forwarded-for": "192.0.2.1" },
  });
  assert.equal(blocked.status, 429);
  await login(a, { ip: "127.0.0.3" });
  check("ip-budget-account-rotation-spoofed-forwarded-header-independent-peer");
  writeFileSync(
    resolve(out, "api.json"),
    JSON.stringify(
      {
        source:
          execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: root,
            encoding: "utf8",
          }).trim() + " + working-tree source manifest",
        time: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    resolve(root, ".sprint1-local/api-fixture.json"),
    JSON.stringify({ eventId: id }),
  );
} finally {
  await stop();
  redis.disconnect();
  await db.$disconnect();
}
