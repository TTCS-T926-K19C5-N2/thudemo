import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  appendFileSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { randomBytes, generateKeyPairSync, X509Certificate } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import assert from "node:assert/strict";
import { stagingConfig, stagingRelease } from "../deploy/laptop-gateway.mjs";
import {
  prepareTicketKey,
  ticketKeyEnv,
  requireMigrationReview,
  parseProcessIdentity,
} from "../deploy/laptop-compat.mjs";
import {
  signLoginPeer,
  LOGIN_PEER_HEADER,
} from "../packages/shared/login-peer.js";
import {
  pointerSnapshot,
  restorePointers,
  promoteRelease,
} from "../deploy/laptop-release.mjs";
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, ".sprint1-staging");
mkdirSync(resolve(dir, "logs"), { recursive: true });
const action = process.argv[2] ?? "status";
const option = (name) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};
const exerciseFailure = process.argv.includes("--exercise-failure");
function config() {
  return stagingConfig(
    JSON.parse(readFileSync(resolve(dir, "config.json"), "utf8")),
  );
}
function git(...args) {
  const r = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error("Git revision operation failed");
  return r.stdout.trim();
}
function run(step, command, args, options = {}) {
  const log = resolve(dir, "logs", `${Date.now()}-${step}.log`),
    fd = openSync(log, "w");
  const result = spawnSync(command, args, {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", fd, fd],
    ...options,
  });
  closeSync(fd);
  if (result.status !== 0)
    throw new Error(
      `${step} failed (exit ${result.status}); inspect private staging logs`,
    );
}
function docker(...args) {
  const r = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0)
    throw new Error(
      "Docker operation failed; inspect private staging logs/containers",
    );
  return r.stdout.trim();
}
function timeline(event, details = {}) {
  appendFileSync(
    resolve(dir, "timeline.jsonl"),
    JSON.stringify({ time: new Date().toISOString(), event, ...details }) +
      "\n",
  );
}
async function free(port) {
  await new Promise((done, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => s.close(done));
  });
}
function ownedContainer(name) {
  const found = docker("ps", "-a", "--format", "{{.Names}}")
    .split(/\r?\n/)
    .includes(name);
  if (!found) return false;
  const item = JSON.parse(docker("inspect", name))[0];
  if (item.Config.Labels?.["sprint1.staging"] !== "20261015")
    throw new Error("Refuse foreign container");
  return true;
}
function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid < 1) throw new Error("Invalid process id");
  const command = `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){[pscustomobject]@{created=$p.CreationDate.ToUniversalTime().ToString('o');command=$p.CommandLine;name=$p.Name}|ConvertTo-Json -Compress}`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
  });
  return parseProcessIdentity(r);
}
function remember(child, entry) {
  child.unref();
  const identity = processIdentity(child.pid);
  if (!identity)
    throw new Error("Owned process exited before identity was captured");
  return { pid: child.pid, created: identity.created, entry };
}
function stopOwned(record) {
  if (!record) return;
  const current = processIdentity(record.pid);
  if (!current) return;
  if (
    current.name !== "node.exe" ||
    current.created !== record.created ||
    !current.command.includes(record.entry) ||
    !resolve(record.entry).startsWith(root + "\\")
  )
    throw new Error("Refuse process identity mismatch");
  process.kill(record.pid);
}
const network = "sprint1-staging-20261015";
function ensureNetwork() {
  if (
    !docker("network", "ls", "--format", "{{.Name}}")
      .split(/\r?\n/)
      .includes(network)
  )
    docker("network", "create", "--label", "sprint1.staging=20261015", network);
  const info = JSON.parse(docker("network", "inspect", network))[0];
  if (info.Labels?.["sprint1.staging"] !== "20261015")
    throw Error("Refuse foreign staging network");
  for (const name of [
    "sprint1-stage-pg-20261015",
    "sprint1-stage-redis-20261015",
  ]) {
    if (!ownedContainer(name)) throw Error("Staging dependency missing");
    if (
      !JSON.parse(docker("inspect", name))[0].NetworkSettings.Networks[network]
    )
      docker("network", "connect", network, name);
  }
}
function stopRelease(release) {
  stopOwned(release.webProcess);
  for (const name of [release.webContainer, release.apiContainer])
    if (name && ownedContainer(name)) docker("stop", name);
}
function apiEnv(c) {
  return {
    ...ticketKeyEnv(dir),
    NODE_ENV: "production",
    APP_ENV: "staging",
    SERVICE_ROLE: "api",
    PORT: "10000",
    DATABASE_URL: `postgresql://${c.user}:${c.dbPassword}@sprint1-stage-pg-20261015:5432/${c.database}?schema=public`,
    REDIS_HOST: "sprint1-stage-redis-20261015",
    REDIS_PORT: "6379",
    REDIS_URL: "",
    WEB_ORIGIN: `https://${c.lanAddress}:${c.gatewayPort}`,
    AUTH_PROXY_SECRET: c.authProxySecret,
    HOLD_EXPIRY_MODE: "off",
    ORDER_EXPIRY_MODE: "off",
    SCANNER_KEY_ID: "sprint1-staging",
    SCANNER_SIGNING_PRIVATE_KEY_FILE: "/run/secrets/scanner.pem",
    SCANNER_PUBLIC_KEYS: c.scannerPublicKeys,
    PAYMENT_GATEWAY: "momo",
    MOMO_ACCESS_KEY: c.disabledGatewayKey,
    MOMO_SECRET_KEY: c.disabledGatewaySecret,
    MOMO_ENDPOINT: "https://sandbox-disabled.invalid",
    PAYMENT_WEBHOOK_SECRET: c.webhookSecret,
  };
}
function acquireLock() {
  const path = resolve(dir, "deployment.lock");
  const identity = processIdentity(process.pid),
    nonce = randomBytes(16).toString("hex");
  if (!identity) throw new Error("Cannot verify deployment owner");
  let fd;
  try {
    fd = openSync(path, "wx");
  } catch {
    throw new Error(
      "Staging deployment lock exists; inspect owner or use recover-lock after it exits",
    );
  }
  writeFileSync(
    fd,
    JSON.stringify({
      profile: "sprint1-laptop-20261015",
      pid: process.pid,
      created: identity.created,
      nonce,
    }),
  );
  closeSync(fd);
  return () => {
    const owner = JSON.parse(readFileSync(path));
    if (owner.pid !== process.pid || owner.nonce !== nonce)
      throw new Error("Deployment lock owner changed");
    unlinkSync(path);
  };
}
function writeEnv(file, values) {
  writeFileSync(
    file,
    Object.entries(values)
      .filter(([key]) => !key.startsWith("PSModulePath"))
      .map(
        ([key, value]) =>
          `${key}=${String(value).replaceAll("\r", "").replaceAll("\n", "\\n")}`,
      )
      .join("\n") + "\n",
  );
}
async function internalCall(
  port,
  path,
  { method = "GET", body, headers = {} } = {},
) {
  return await new Promise((done, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        timeout: 15000,
      },
      (res) => {
        let text = "";
        res.on("data", (x) => (text += x));
        res.on("end", () =>
          done({ status: res.statusCode, headers: res.headers, text }),
        );
      },
    );
    req.once("error", reject);
    req.once("timeout", () => req.destroy(new Error("timeout")));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
export async function stagingHttps(c, path, options = {}) {
  return await new Promise((done, reject) => {
    const req = https.request(
      {
        hostname: c.lanAddress,
        port: c.gatewayPort,
        path,
        method: options.method ?? "GET",
        ca: readFileSync(resolve(dir, "tls/server-cert.pem")),
        rejectUnauthorized: true,
        headers: options.headers ?? {},
        timeout: 15000,
      },
      (res) => {
        let text = "";
        res.on("data", (x) => (text += x));
        res.on("end", () =>
          done({ status: res.statusCode, text, headers: res.headers }),
        );
      },
    );
    req.once("error", reject);
    req.once("timeout", () => req.destroy(new Error("TLS request timeout")));
    req.end(options.body ? JSON.stringify(options.body) : undefined);
  });
}
async function waitHealth(port) {
  for (let n = 0; n < 90; n++) {
    try {
      if ((await internalCall(port, "/health")).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Candidate API not healthy");
}
async function smoke(c, release, wrongKey = false) {
  assert.equal(
    (await internalCall(release.webPort, "/api/health")).status,
    200,
  );
  assert.equal((await internalCall(release.webPort, "/")).status, 200);
  const user = c.accounts.find((a) => a.email.startsWith("organizer-a@"));
  const login = await internalCall(release.webPort, "/api/auth/login", {
    method: "POST",
    body: user,
    headers: {
      origin: `https://${c.lanAddress}:${c.gatewayPort}`,
      [LOGIN_PEER_HEADER]: signLoginPeer(
        "192.0.2.20",
        wrongKey ? randomBytes(32).toString("hex") : c.authProxySecret,
      ),
    },
  });
  assert.equal(login.status, 200);
  assert.match(login.headers["set-cookie"][0], /Secure/);
  assert.match(login.headers["set-cookie"][0], /HttpOnly/);
}
async function startGateway(c) {
  const state = resolve(dir, "gateway-process.json");
  if (existsSync(state)) {
    const old = JSON.parse(readFileSync(state));
    const current = processIdentity(old.pid);
    if (
      current &&
      current.created === old.created &&
      current.command.includes(old.entry)
    )
      return;
  }
  await new Promise((done, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(c.gatewayPort, c.lanAddress, () => s.close(done));
  });
  const entry = resolve(root, "deploy/laptop-gateway.mjs"),
    out = openSync(resolve(dir, "logs/gateway.out.log"), "a"),
    err = openSync(resolve(dir, "logs/gateway.err.log"), "a");
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    windowsHide: true,
    detached: true,
    stdio: ["ignore", out, err],
  });
  closeSync(out);
  closeSync(err);
  writeFileSync(state, JSON.stringify(remember(child, entry), null, 2));
}
async function init() {
  if (existsSync(resolve(dir, "config.json"))) {
    config();
    console.log("Existing staging configuration retained.");
    return;
  }
  const lanAddress = option("--lan");
  if (
    !Object.values(networkInterfaces())
      .flat()
      .some((v) => v?.address === lanAddress)
  )
    throw new Error("Choose an assigned private LAN IPv4 using --lan");
  const secret = () => randomBytes(32).toString("base64url"),
    keys = generateKeyPairSync("ed25519");
  const c = stagingConfig({
    profile: "sprint1-laptop-20261015",
    lanAddress,
    gatewayPort: 3470,
    pgPort: 15455,
    redisPort: 16405,
    database: "sprint1_staging_20261015",
    user: "sprint1_staging",
    dbPassword: secret(),
    authProxySecret: secret(),
    disabledGatewayKey: secret(),
    disabledGatewaySecret: secret(),
    webhookSecret: secret(),
    scannerPublicKeys: JSON.stringify({
      "sprint1-staging": keys.publicKey.export({ type: "spki", format: "pem" }),
    }),
    accounts: [
      "admin",
      "organizer-a",
      "organizer-b",
      "buyer",
      "lock-test",
      "multi-role",
    ].map((name) => ({
      email: `${name}@sprint1.staging.invalid`,
      password: secret(),
      roles:
        name === "admin"
          ? ["ADMIN"]
          : name.startsWith("organizer")
            ? ["ORGANIZER"]
            : name === "multi-role"
              ? ["BUYER", "ORGANIZER"]
              : ["BUYER"],
    })),
  });
  mkdirSync(resolve(dir, "tls"), { recursive: true });
  writeFileSync(resolve(dir, "config.json"), JSON.stringify(c, null, 2));
  writeFileSync(
    resolve(dir, "scanner-signing.pem"),
    keys.privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  run("certificate", "docker", [
    "run",
    "--rm",
    "--entrypoint",
    "openssl",
    "--mount",
    `type=bind,source=${resolve(dir, "tls")},target=/tls`,
    "sprint1-gitflow-render:20261015",
    "req",
    "-x509",
    "-newkey",
    "rsa:3072",
    "-sha256",
    "-nodes",
    "-days",
    "30",
    "-keyout",
    "/tls/server-key.pem",
    "-out",
    "/tls/server-cert.pem",
    "-subj",
    "/CN=Sprint1 Laptop Staging",
    "-addext",
    `subjectAltName=IP:${c.lanAddress},DNS:localhost`,
    "-addext",
    "basicConstraints=critical,CA:FALSE",
    "-addext",
    "extendedKeyUsage=serverAuth",
  ]);
  const cert = new X509Certificate(
    readFileSync(resolve(dir, "tls/server-cert.pem")),
  );
  writeFileSync(resolve(dir, "tls/server-cert.cer"), cert.raw);
  timeline("initialized", {
    lanAddress,
    certificateSha256: cert.fingerprint256,
    expires: cert.validTo,
  });
  console.log(
    "Staging configuration ready. Credentials: .sprint1-staging/config.json; certificate: .sprint1-staging/tls/server-cert.cer",
  );
}
async function dependencies(c) {
  for (const [name, port] of [
    ["sprint1-stage-pg-20261015", c.pgPort],
    ["sprint1-stage-redis-20261015", c.redisPort],
  ])
    if (!ownedContainer(name)) await free(port);
  writeEnv(resolve(dir, "postgres.env"), {
    POSTGRES_USER: c.user,
    POSTGRES_PASSWORD: c.dbPassword,
    POSTGRES_DB: c.database,
  });
  if (!ownedContainer("sprint1-stage-pg-20261015"))
    docker(
      "run",
      "-d",
      "--name",
      "sprint1-stage-pg-20261015",
      "--label",
      "sprint1.staging=20261015",
      "--env-file",
      resolve(dir, "postgres.env"),
      "-p",
      `127.0.0.1:${c.pgPort}:5432`,
      "-v",
      "sprint1-stage-pg-data:/var/lib/postgresql/data",
      "postgres:15-alpine",
    );
  if (!ownedContainer("sprint1-stage-redis-20261015"))
    docker(
      "run",
      "-d",
      "--name",
      "sprint1-stage-redis-20261015",
      "--label",
      "sprint1.staging=20261015",
      "-p",
      `127.0.0.1:${c.redisPort}:6379`,
      "-v",
      "sprint1-stage-redis-data:/data",
      "redis:7-alpine",
      "redis-server",
      "--appendonly",
      "yes",
    );
  docker("start", "sprint1-stage-pg-20261015", "sprint1-stage-redis-20261015");
  for (let n = 0; n < 60; n++) {
    const pg = spawnSync(
      "docker",
      [
        "exec",
        "sprint1-stage-pg-20261015",
        "pg_isready",
        "-U",
        c.user,
        "-d",
        c.database,
      ],
      { stdio: "ignore", windowsHide: true },
    );
    if (
      pg.status === 0 &&
      docker("exec", "sprint1-stage-redis-20261015", "redis-cli", "ping") ===
        "PONG"
    )
      return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Staging dependencies not ready");
}
async function deploy() {
  const c = config(),
    sha = option("--sha") ?? git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(sha))
    throw new Error("Exact 40-character source SHA required");
  git("cat-file", "-e", sha + "^{commit}");
  const started = Date.now(),
    activePath = resolve(dir, "active.json"),
    active = existsSync(activePath)
      ? stagingRelease(JSON.parse(readFileSync(activePath)))
      : null;
  if (active?.sha === sha && !exerciseFailure) {
    await startGateway(c);
    console.log("This source is already active; use status.");
    return;
  }
  timeline("candidate-start", { sha });
  await dependencies(c);
  ensureNetwork();
  const releaseRoot = resolve(dir, "releases", sha);
  mkdirSync(releaseRoot, { recursive: true });
  const source = resolve(releaseRoot, "source");
  if (!existsSync(source)) {
    mkdirSync(source);
    git(
      "archive",
      "--format=zip",
      `--output=${resolve(releaseRoot, "source.zip")}`,
      sha,
    );
    run("extract", "tar", [
      "-xf",
      resolve(releaseRoot, "source.zip"),
      "-C",
      source,
    ]);
  }
  if (active) {
    const changed = git(
      "diff",
      "--name-only",
      active.sha,
      sha,
      "--",
      "apps/api/prisma/migrations",
    );
    requireMigrationReview(
      active.sha,
      changed,
      option("--reviewed-migrations-from"),
    );
    if (changed)
      timeline("manual-migration-compatibility-acknowledged", {
        from: active.sha,
        to: sha,
        files: changed.split(/\r?\n/),
      });
  }
  const dbURL = `postgresql://${c.user}:${c.dbPassword}@127.0.0.1:${c.pgPort}/${c.database}?schema=public`;
  const env = {
    ...process.env,
    DATABASE_URL: dbURL,
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: String(c.redisPort),
    REDIS_URL: "",
    SPRINT1_STAGING_CONFIG: resolve(dir, "config.json"),
    SPRINT1_STAGING_WRITE: c.profile,
  };
  // These are fixed command arguments, never credentials or user-supplied shell text.
  run("install", "corepack.cmd", ["pnpm", "install", "--frozen-lockfile"], {
    cwd: source,
    env,
    shell: true,
  });
  run(
    "generate",
    process.execPath,
    [
      resolve(source, "apps/api/node_modules/prisma/build/index.js"),
      "generate",
    ],
    { cwd: resolve(source, "apps/api"), env },
  );
  const backup = spawnSync(
    "docker",
    [
      "exec",
      "sprint1-stage-pg-20261015",
      "pg_dump",
      "-U",
      c.user,
      "-d",
      c.database,
      "-Fc",
    ],
    { windowsHide: true },
  );
  if (backup.status !== 0) throw new Error("Backup failed; migration not run");
  mkdirSync(resolve(dir, "backups"), { recursive: true });
  writeFileSync(
    resolve(dir, "backups", `${Date.now()}-${sha}.dump`),
    backup.stdout,
  );
  run(
    "migrate",
    process.execPath,
    [
      resolve(source, "apps/api/node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
    ],
    { cwd: resolve(source, "apps/api"), env },
  );
  run(
    "seed",
    process.execPath,
    [resolve(root, "apps/api/scripts/seed-sprint1-staging.mjs")],
    { env },
  );
  const image = `sprint1-staging-api:${sha.slice(0, 12)}`;
  run(
    "api-image",
    "docker",
    [
      "build",
      "--target",
      "api",
      "--label",
      `org.opencontainers.image.revision=${sha}`,
      "-t",
      image,
      ".",
    ],
    { cwd: source },
  );
  const webImage = `sprint1-staging-web:${sha.slice(0, 12)}`;
  run(
    "web-image",
    "docker",
    [
      "build",
      "--target",
      "web",
      "--label",
      `org.opencontainers.image.revision=${sha}`,
      "-t",
      webImage,
      ".",
    ],
    { cwd: source },
  );
  const slot = active?.webPort === 3473 ? 1 : 0,
    webPort = 3473 + slot,
    apiPort = 3471 + slot;
  const slotFile = resolve(dir, `slot-${slot}.json`);
  if (existsSync(slotFile)) {
    const stale = JSON.parse(readFileSync(slotFile));
    if (stale.sha === active?.sha) throw new Error("Refuse active slot");
    stopRelease(stale);
  }
  await free(webPort);
  await free(apiPort);
  const apiContainer = `sprint1-stage-api-${sha.slice(0, 12)}-${Date.now()}`;
  const file = resolve(releaseRoot, "api.env");
  writeEnv(file, apiEnv(c));
  docker(
    "run",
    "-d",
    "--name",
    apiContainer,
    "--label",
    "sprint1.staging=20261015",
    "--network",
    network,
    "--env-file",
    file,
    "-p",
    `127.0.0.1:${apiPort}:10000`,
    "--mount",
    `type=bind,source=${resolve(dir, "scanner-signing.pem")},target=/run/secrets/scanner.pem,readonly`,
    image,
  );
  let webContainer;
  let switched = false;
  const pointers = pointerSnapshot(dir);
  try {
    await waitHealth(apiPort);
    webContainer = `sprint1-stage-web-${sha.slice(0, 12)}-${Date.now()}`;
    const webFile = resolve(releaseRoot, "web.env");
    writeEnv(webFile, {
      NODE_ENV: "production",
      API_INTERNAL_URL: `http://${apiContainer}:10000`,
      AUTH_PROXY_SECRET: c.authProxySecret,
    });
    // The existing LAN gateway owns the peer and signs the login attestation.
    // Use Next's private listener here; route handlers still verify the HMAC.
    // server.mjs is for direct transport ownership and would replace it with
    // the container's gateway peer. Do not nest the two transport owners.
    docker(
      "run",
      "-d",
      "--name",
      webContainer,
      "--label",
      "sprint1.staging=20261015",
      "--network",
      network,
      "--env-file",
      webFile,
      "-p",
      `127.0.0.1:${webPort}:3000`,
      webImage,
      "node",
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "0.0.0.0",
      "--port",
      "3000",
    );
    const release = {
      sha,
      webPort,
      apiPort,
      apiContainer,
      image,
      webContainer,
      webImage,
      network,
      startedAt: new Date().toISOString(),
    };
    let ready = false;
    for (let n = 0; n < 90; n++) {
      try {
        if ((await internalCall(webPort, "/api/health")).status === 200) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error("Candidate web unhealthy");
    if (exerciseFailure) {
      let rejected = false;
      try {
        await smoke(c, release, true);
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true);
      if (active)
        assert.equal((await stagingHttps(c, "/api/health")).status, 200);
      timeline("controlled-candidate-rejected-old-retained", {
        sha,
        activeSha: active?.sha ?? null,
      });
      stopRelease(release);
      console.log(
        "Controlled candidate failed verification; active release retained.",
      );
      return;
    }
    await smoke(c, release);
    writeFileSync(slotFile, JSON.stringify(release, null, 2));
    await startGateway(c);
    await promoteRelease(dir, release, async () => {
      assert.equal((await stagingHttps(c, "/api/health")).status, 200);
      assert.equal((await stagingHttps(c, "/")).status, 200);
    });
    switched = true;
    timeline("promoted", {
      sha,
      oldSha: active?.sha ?? null,
      elapsedSeconds: (Date.now() - started) / 1000,
    });
    console.log(
      `STAGING READY https://${c.lanAddress}:${c.gatewayPort} source=${sha}; credentials .sprint1-staging/config.json`,
    );
  } catch (error) {
    if (switched) restorePointers(dir, pointers);
    if (webContainer && ownedContainer(webContainer))
      docker("stop", webContainer);
    if (ownedContainer(apiContainer)) docker("stop", apiContainer);
    timeline("candidate-failed-old-retained", {
      sha,
      activeSha: active?.sha ?? null,
      pointerRestored: true,
    });
    throw error;
  }
}
async function main() {
  if (action === "init") {
    await init();
    return;
  }
  const c = config();
  if (action === "prepare-ticket-key") {
    prepareTicketKey(dir);
    console.log(
      "Persistent staging ticket key is ready; existing key preserved.",
    );
    return;
  }
  if (action === "deploy") {
    await deploy();
    return;
  }
  if (action === "status") {
    const active = stagingRelease(
      JSON.parse(readFileSync(resolve(dir, "active.json"))),
    );
    assert.equal((await stagingHttps(c, "/api/health")).status, 200);
    assert.equal((await stagingHttps(c, "/")).status, 200);
    console.log(
      `STAGING READY https://${c.lanAddress}:${c.gatewayPort} source=${active.sha}; machine2 LAN check still separate`,
    );
    return;
  }
  if (action === "rollback") {
    const previous = stagingRelease(
      JSON.parse(readFileSync(resolve(dir, "previous.json"))),
    );
    await smoke(c, previous);
    await promoteRelease(dir, previous, async () =>
      assert.equal((await stagingHttps(c, "/api/health")).status, 200),
    );
    timeline("rollback", { sha: previous.sha });
    console.log("Rollback passed; database/history retained.");
    return;
  }
  if (action === "stop") {
    for (const file of [
      "watcher-process.json",
      "gateway-process.json",
      "slot-0.json",
      "slot-1.json",
    ])
      if (existsSync(resolve(dir, file))) {
        const value = JSON.parse(readFileSync(resolve(dir, file)));
        if (value.apiContainer) stopRelease(value);
        else stopOwned(value);
      }
    console.log(
      "Owned staging processes stopped; dependencies, keys, volumes and data retained.",
    );
    return;
  }
  throw new Error(
    "Use init --lan <assignedIPv4>, deploy --sha <40hex>, status, rollback or stop",
  );
}
async function lockedMain() {
  if (action === "recover-lock") {
    const file = resolve(dir, "deployment.lock"),
      owner = JSON.parse(readFileSync(file));
    if (
      owner.profile !== "sprint1-laptop-20261015" ||
      !Number.isInteger(owner.pid)
    )
      throw new Error("Unrecognized lock");
    const current = processIdentity(owner.pid);
    if (current && current.created === owner.created)
      throw new Error("Lock owner is still alive");
    unlinkSync(file);
    console.log("Verified stale deployment lock removed.");
    return;
  }
  const release = [
    "init",
    "prepare-ticket-key",
    "deploy",
    "rollback",
    "stop",
  ].includes(action)
    ? acquireLock()
    : () => {};
  try {
    await main();
  } finally {
    release();
  }
}
lockedMain().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
