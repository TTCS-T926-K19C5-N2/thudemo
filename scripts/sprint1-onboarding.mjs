import { createHash, randomBytes, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:net";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

const root = realpathSync(resolve(import.meta.dirname, ".."));
process.chdir(root);
const demoCatalog = JSON.parse(
  readFileSync(resolve(root, "demo-data/catalog.source.json"), "utf8"),
);
if (demoCatalog.catalog?.length !== 40)
  throw new Error("Expected the preserved 40-event demo catalog.");
const action = process.argv[2] ?? "Start";
if (!["Start", "Stop", "Status", "Restart"].includes(action))
  throw Error("Use Start, Stop, Status or Restart");
if (process.platform !== "win32" || process.version !== "v24.21.0")
  throw Error("Verified prerequisite: Windows with Node24.21.0");
const dir = resolve(root, ".sprint1-demo");
const configFile = resolve(dir, "config.json");
const envFile = resolve(root, ".env");
const stateFile = resolve(dir, "processes.json");
const worker = resolve(root, "scripts/sprint1-onboarding-worker.mjs");
const quiet = (...args) =>
  execFileSync(...args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const ps = (command) =>
  quiet("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    command,
  ]);
const git = (...args) => quiet("git", args);
const secret = () => randomBytes(32).toString("base64url");
const identity = createHash("sha256")
  .update(root.toLowerCase())
  .digest("hex")
  .slice(0, 12);
const profile = `s1demo-${identity}`;
let config;
let state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile))
  : { processes: [] };
const jsonWrite = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
class DemoError extends Error {}
const fail = (message) => {
  throw new DemoError(message);
};

function fingerprint() {
  const files = new Set();
  if (existsSync(resolve(root, ".git"))) {
    for (const path of (
      git("ls-files") +
      "\n" +
      git("ls-files", "--others", "--exclude-standard")
    ).split(/\r?\n/))
      if (path) files.add(path);
  } else {
    const ignored = new Set([
      ".git", "node_modules", ".next", "dist", ".sprint1-demo",
      ".cache", "evidence", "coverage",
    ]);
    const walk = (directory, prefix = "") => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignored.has(entry.name)) continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(resolve(directory, entry.name), relative);
        else if (!/^\.env(?:\.|$)/.test(entry.name)) files.add(relative);
      }
    };
    walk(root);
  }
  const hash = createHash("sha256");
  for (const path of [...files]
    .filter(
      (path) =>
        /^(apps\/(api|web)\/|packages\/shared\/|scripts\/(sprint1-onboarding|create-demo-showtime|create-demo-scanner-showtime)|demo-data\/|pnpm-lock.yaml$|package.json$)/.test(
          path,
        ) &&
        !path.startsWith("apps/web/.next/") &&
        existsSync(path),
    )
    .sort()) {
    hash.update(path);
    hash.update(readFileSync(path));
  }
  return hash.digest("hex");
}

async function freePort(preferred, used) {
  for (let candidate = preferred; candidate < preferred + 1000; candidate++) {
    if (used.has(candidate)) continue;
    const available = await new Promise((done) => {
      const server = createServer();
      server.once("error", () => done(false));
      server.listen(candidate, "127.0.0.1", () =>
        server.close(() => done(true)),
      );
    });
    if (available) {
      used.add(candidate);
      return candidate;
    }
  }
  fail("No free local port; no process was stopped");
}

function assertConfig() {
  if (
    config.root !== root ||
    config.profile !== profile ||
    config.database !== `sprint1_demo_${identity}` ||
    config.user !== "sprint1_demo"
  )
    fail("Profile ownership mismatch; no mutation performed");
  const env = parseEnv(readFileSync(envFile, "utf8"));
  if (
    env.SPRINT1_DEMO_PROFILE !== profile ||
    env.DATABASE_URL !==
      `postgresql://${config.user}:${config.dbPassword}@127.0.0.1:${config.ports.postgres}/${config.database}` ||
    env.AUTH_PROXY_SECRET !== config.proxySecret ||
    env.REGISTRATION_MAIL_KEY !== config.mailKey ||
    env.WEB_PORT !== String(config.ports.web) ||
    env.PORT !== String(config.ports.api)
  )
    fail("Owned .env changed; inspect private config before continuing");
  return env;
}

function compose(...args) {
  const result = spawnSync(
    "docker",
    ["compose", "-p", profile, "-f", resolve(dir, "compose.json"), ...args],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0)
    fail("Docker Compose failed; inspect .sprint1-demo/docker.log");
  writeFileSync(resolve(dir, "docker.log"), result.stdout + result.stderr);
}

function validateContainers() {
  const names = quiet("docker", ["ps", "-a", "--format", "{{.Names}}"]).split(
    /\r?\n/,
  );
  for (const service of ["postgres", "redis", "mailpit"]) {
    const name = `${profile}-${service}-1`;
    if (!names.includes(name)) continue;
    const found = JSON.parse(quiet("docker", ["inspect", name]))[0];
    if (
      found.Config.Labels["sprint1.demo.profile"] !== profile ||
      found.Config.Labels["sprint1.demo.root"] !== root
    )
      fail("Refuse foreign container; no mutation performed");
    const expected = String(
      config.ports[service === "mailpit" ? "mailUi" : service],
    );
    const bindings = found.HostConfig.PortBindings;
    const key =
      service === "postgres"
        ? "5432/tcp"
        : service === "redis"
          ? "6379/tcp"
          : "8025/tcp";
    if (
      bindings[key]?.[0]?.HostIp !== "127.0.0.1" ||
      bindings[key]?.[0]?.HostPort !== expected
    )
      fail("Existing container port/bind differs from owned config");
  }
}

function processInfo(pid) {
  if (!Number.isInteger(pid) || pid < 1) fail("Invalid saved process id");
  const raw = ps(
    `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){[pscustomobject]@{pid=$p.ProcessId;name=$p.Name;command=$p.CommandLine;created=$p.CreationDate.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress}`,
  );
  return raw ? JSON.parse(raw) : null;
}

function owned(entry) {
  const current = processInfo(entry.pid);
  if (!current) return null;
  if (
    current.name !== "node.exe" ||
    current.created !== entry.created ||
    !current.command?.includes(worker) ||
    !current.command.trim().endsWith(` ${entry.mode}`)
  )
    fail("Saved PID now belongs to another process; no stop performed");
  return current;
}

function stopOwned() {
  for (const entry of state.processes) {
    if (!owned(entry)) continue;
    ps(
      `function Stop-OwnedTree([int]$taskPid){foreach($c in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$taskPid")){$live=Get-CimInstance Win32_Process -Filter "ProcessId=$($c.ProcessId)";if($live -and $live.CreationDate -eq $c.CreationDate){Stop-OwnedTree $c.ProcessId}};Stop-Process -Id $taskPid -ErrorAction SilentlyContinue};Stop-OwnedTree ${entry.pid}`,
    );
  }
  state = { ...state, processes: [] };
  jsonWrite(stateFile, state);
  validateContainers();
  compose("stop");
  console.log(
    "STOPPED: only this demo profile. Database, mail, volumes and secrets retained.",
  );
}

function runLog(label, command, env) {
  console.log(`Demo: ${label}…`);
  const path = resolve(dir, label + ".log");
  const fd = openSync(path, "w");
  const result = spawnSync("cmd.exe", ["/d", "/s", "/c", command], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  if (result.status !== 0)
    fail(
      `${label} failed (exit ${result.status}); see ${path}. READY not reached.`,
    );
}

async function health() {
  const web = `http://localhost:${config.ports.web}`;
  const responses = await Promise.all(
    [
      `http://127.0.0.1:${config.ports.api}/health`,
      web,
      web + "/api/health",
      `http://127.0.0.1:${config.ports.mailUi}/api/v1/info`,
    ].map((url) => fetch(url, { signal: AbortSignal.timeout(4000) })),
  );
  if (
    !responses.every((r) => r.status === 200) ||
    (await responses[0].json()).status !== "ok" ||
    (await responses[2].json()).status !== "ok"
  )
    fail("Demo dependencies/web/proxy not healthy");
}

async function smoke() {
  const api = `http://127.0.0.1:${config.ports.api}`;
  const origin = `http://localhost:${config.ports.web}`;
  const required = [
    ["admin", "ADMIN"],
    ["organizer-a", "ORGANIZER"],
    ["buyer", "BUYER"],
    ["staff", "STAFF"],
    ["accountant", "ACCOUNTANT"],
  ];
  for (const [name, role] of required) {
    const account = config.accounts.find((item) => item.name === name);
    const login = await fetch(api + "/auth/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    if (login.status !== 200) fail(`Role login smoke failed: ${role}`);
    const cookie = login.headers.getSetCookie()[0]?.split(";")[0];
    if (!cookie) fail(`Role session missing: ${role}`);
    const me = await fetch(api + "/auth/me", { headers: { cookie } });
    if (me.status !== 200 || !(await me.json()).roles.includes(role))
      fail(`Role session smoke failed: ${role}`);
    const logout = await fetch(api + "/auth/logout", {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: "{}",
    });
    if (logout.status !== 200) fail(`Role logout smoke failed: ${role}`);
    if (name === "buyer") {
      const replay = await fetch(api + "/auth/me", { headers: { cookie } });
      if (replay.status !== 401) fail("Logout replay smoke failed");
    }
  }
}

function ready() {
  console.log(
    `READY web=http://localhost:${config.ports.web} API=http://localhost:${config.ports.api} mail-catcher=http://127.0.0.1:${config.ports.mailUi}`,
  );
  console.log(
    `Profile=${profile}; source=${state.source}; credentials=${configFile}`,
  );
  console.log(
    "Mail catcher is local test delivery, not Internet email. Stop/restart with the same entrypoint -Action Stop/Restart.",
  );
}

try {
  if (
    quiet("cmd.exe", ["/d", "/s", "/c", "corepack pnpm --version"]) !==
    "10.15.1"
  )
    fail("pnpm10.15.1 via Corepack required");
  if (quiet("docker", ["info", "--format", "{{.OSType}}"]) !== "linux")
    fail("Docker Desktop Linux engine required");
  if (!existsSync(configFile)) {
    if (action !== "Start") fail("No owned demo profile exists yet");
    if (existsSync(envFile))
      fail(
        "Existing .env belongs to another setup. Use a separate clean clone; no overwrite performed.",
      );
    const used = new Set();
    const ports = {};
    for (const [key, preferred] of [
      ["web", 3000],
      ["api", 3001],
      ["postgres", 15460],
      ["redis", 16410],
      ["smtp", 24930],
      ["mailUi", 24931],
    ])
      ports[key] = await freePort(preferred, used);
    config = {
      root,
      profile,
      database: `sprint1_demo_${identity}`,
      user: "sprint1_demo",
      dbPassword: secret(),
      proxySecret: secret(),
      mailKey: secret(),
      webhookSecret: secret(),
      ports,
      demoShowtime: {
        eventId: demoCatalog.catalog[0].id,
        sourceShowtimeId: demoCatalog.catalog[0].showtimes[0].id,
        startTime: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
          .toISOString()
          .replace(/T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "T12:30:00.000Z"),
      },
      accounts: [
        "admin",
        "organizer-a",
        "organizer-b",
        "buyer",
        "staff",
        "accountant",
        "lock-test",
      ].map((name) => ({
        name,
        email: `${name}@${profile}.demo.invalid`,
        password: secret(),
        roles: [
          name === "admin"
            ? "ADMIN"
            : name.startsWith("organizer")
              ? "ORGANIZER"
              : name === "staff"
                ? "STAFF"
                : name === "accountant"
                  ? "ACCOUNTANT"
                  : "BUYER",
        ],
      })),
    };
    mkdirSync(dir, { recursive: true });
    const pair = generateKeyPairSync("ed25519");
    writeFileSync(
      resolve(dir, "signing.pem"),
      pair.privateKey.export({ type: "pkcs8", format: "pem" }),
      { mode: 0o600 },
    );
    const publicKeys = JSON.stringify({
      [profile]: pair.publicKey.export({ type: "spki", format: "pem" }),
    });
    jsonWrite(configFile, config);
    writeFileSync(
      envFile,
      [
        `SPRINT1_DEMO_PROFILE=${profile}`,
        `DATABASE_URL=postgresql://${config.user}:${config.dbPassword}@127.0.0.1:${ports.postgres}/${config.database}`,
        "REDIS_HOST=127.0.0.1",
        `REDIS_PORT=${ports.redis}`,
        "REDIS_URL=",
        `PORT=${ports.api}`,
        `WEB_PORT=${ports.web}`,
        "WEB_HOST=127.0.0.1",
        `WEB_ORIGIN=http://localhost:${ports.web}`,
        `API_INTERNAL_URL=http://127.0.0.1:${ports.api}`,
        `AUTH_PROXY_SECRET=${config.proxySecret}`,
        "APP_ENV=development",
        "NODE_ENV=development",
        "PAYMENT_GATEWAY=mock",
        `PAYMENT_WEBHOOK_SECRET=${config.webhookSecret}`,
        `SCANNER_KEY_ID=${profile}`,
        `SCANNER_SIGNING_PRIVATE_KEY_FILE=${resolve(dir, "signing.pem").replaceAll("\\", "/")}`,
        "SCANNER_SIGNING_PRIVATE_KEY=",
        "SCANNER_PUBLIC_KEY=",
        `SCANNER_PUBLIC_KEYS='${publicKeys}'`,
        `TICKET_SIGNING_ACTIVE_KEY_ID=${profile}`,
        `TICKET_SIGNING_PRIVATE_KEY=${pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")}`,
        `TICKET_SIGNING_PUBLIC_KEYS='${publicKeys}'`,
        "TICKET_MAIL_WORKER=true",
        "TICKET_MAIL_MODE=catcher",
        "PASSWORD_RESET_WORKER=true",
        "TICKET_SMTP_HOST=127.0.0.1",
        `TICKET_SMTP_PORT=${ports.smtp}`,
        "TICKET_SMTP_FROM=tickets@sprint1.demo.invalid",
        "LIFECYCLE_WORKER=on",
        "NEXT_PUBLIC_DEMO_PROFILE_NOTICE=1",
        `NEXT_PUBLIC_DEMO_PROFILE_LABEL=${profile}`,
        "ORDER_EXPIRY_MODE=off",
        "HOLD_EXPIRY_MODE=off",
        "REGISTRATION_MAIL_MODE=catcher",
        "SMTP_HOST=127.0.0.1",
        `SMTP_PORT=${ports.smtp}`,
        "SMTP_SECURE=false",
        "SMTP_FROM=activation@sprint1.demo.invalid",
        "REGISTRATION_ALLOWED_EMAILS=",
        `REGISTRATION_PUBLIC_ORIGIN=http://localhost:${ports.web}`,
        `REGISTRATION_MAIL_KEY=${config.mailKey}`,
      ].join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
    const labels = {
      "sprint1.demo.profile": profile,
      "sprint1.demo.root": root,
    };
    jsonWrite(resolve(dir, "compose.json"), {
      services: {
        postgres: {
          image: "postgres:15-alpine",
          labels,
          environment: {
            POSTGRES_USER: config.user,
            POSTGRES_PASSWORD: config.dbPassword,
            POSTGRES_DB: config.database,
          },
          ports: [`127.0.0.1:${ports.postgres}:5432`],
          volumes: ["postgres-data:/var/lib/postgresql/data"],
          healthcheck: {
            test: [
              "CMD-SHELL",
              `pg_isready -U ${config.user} -d ${config.database}`,
            ],
            interval: "2s",
            timeout: "3s",
            retries: 30,
          },
        },
        redis: {
          image: "redis:7-alpine",
          labels,
          command: ["redis-server", "--appendonly", "yes"],
          ports: [`127.0.0.1:${ports.redis}:6379`],
          volumes: ["redis-data:/data"],
          healthcheck: {
            test: ["CMD", "redis-cli", "ping"],
            interval: "2s",
            timeout: "3s",
            retries: 30,
          },
        },
        mailpit: {
          image: "axllent/mailpit:v1.27",
          labels,
          ports: [
            `127.0.0.1:${ports.smtp}:1025`,
            `127.0.0.1:${ports.mailUi}:8025`,
          ],
          environment: { MP_DATABASE: "/data/mailpit.db" },
          volumes: ["mail-data:/data"],
        },
      },
      volumes: { "postgres-data": {}, "redis-data": {}, "mail-data": {} },
    });
  } else {
    config = JSON.parse(readFileSync(configFile));
  }
  mkdirSync(resolve(dir, "tmp"), { recursive: true });
  const env = {
    ...process.env,
    ...assertConfig(),
    PNPM_STORE_DIR: resolve(dir, "pnpm-store"),
    TEMP: resolve(dir, "tmp"),
    TMP: resolve(dir, "tmp"),
  };
  const savedBuildMatches = state.built && state.fingerprint === fingerprint();
  // An owned profile that reached READY already has durable demo data. Source
  // changes may require a rebuild, but must never replay catalog/user/showtime
  // initialization on Restart. The private state file is scoped to this exact
  // root/profile and is written only after health + smoke succeeded.
  const profilePreviouslyReady =
    state.built === true &&
    typeof state.readyAt === "string" &&
    typeof state.fingerprint === "string";
  if (process.argv.includes("--skip-build") && !savedBuildMatches)
    fail("SkipBuild requires an unchanged previously built checkout");
  const resumeBuild =
    savedBuildMatches &&
    (action !== "Restart" || process.argv.includes("--skip-build"));
  if (action === "Stop" || action === "Restart") {
    stopOwned();
    if (action === "Stop") process.exit(0);
  }
  const active = state.processes.filter((entry) => owned(entry));
  if (action === "Status" || active.length) {
    if (state.fingerprint !== fingerprint())
      fail("Source changed since this demo build; use -Action Restart");
    if (active.length !== 2)
      fail(
        "Partial demo process state; use -Action Restart to recover only this profile",
      );
    await health();
    await smoke();
    ready();
    process.exit(0);
  }
  const resources = JSON.parse(
    ps(
      "$o=Get-CimInstance Win32_OperatingSystem;[pscustomobject]@{freeC=(Get-PSDrive C).Free;freeRoot=(Get-PSDrive -Name (Get-Item .).PSDrive.Name).Free;freeRam=$o.FreePhysicalMemory*1024}|ConvertTo-Json -Compress",
    ),
  );
  if (
    resources.freeC < (resumeBuild ? 0.5 : 1) * 2 ** 30 ||
    resources.freeRoot < (resumeBuild ? 0.5 : 5) * 2 ** 30 ||
    resources.freeRam < (resumeBuild ? 0.5 : 2) * 2 ** 30
  )
    fail(
      resumeBuild
        ? "Need free system/workspace disk and RAM>=512MiB to resume the verified build"
        : "Need free C>=1GiB, workspace drive>=5GiB and RAM>=2GiB; install cache and temp files stay in the demo profile",
    );
  jsonWrite(resolve(dir, "resources.json"), {
    time: new Date().toISOString(),
    ...resources,
  });
  for (const port of [config.ports.web, config.ports.api]) {
    if ((await freePort(port, new Set())) !== port)
      fail(`Port ${port} is occupied by another process; no process stopped`);
  }
  validateContainers();
  compose("up", "-d", "--wait", "--wait-timeout", "90");
  if (!resumeBuild) {
    runLog(
      "install",
      `corepack pnpm install --frozen-lockfile --store-dir ${env.PNPM_STORE_DIR.replaceAll("\\", "/")}`,
      env,
    );
    runLog("generate", "corepack pnpm --filter api exec prisma generate", env);
    runLog(
      "migrate",
      "corepack pnpm --filter api exec prisma migrate deploy",
      env,
    );
    if (!profilePreviouslyReady) {
      runLog("seed", "node apps/api/scripts/seed-sprint1-onboarding.mjs", env);
      runLog("catalog", "node apps/api/scripts/seed-demo-catalog.mjs", env);
    } else
      console.log(
        "Demo: preserving initialized profile users and catalog; no reseed performed.",
      );
    runLog("build", "corepack pnpm build", { ...env, NODE_ENV: "production" });
  } else
    console.log(
      "Demo: resuming unchanged verified build; install/migration/seed/build already recorded.",
    );
  state = {
    source: existsSync(resolve(root, ".git"))
      ? git("rev-parse", "HEAD")
      : "prepared-file-tree",
    localDiff: existsSync(resolve(root, ".git"))
      ? !!git("status", "--porcelain")
      : true,
    built: true,
    fingerprint: fingerprint(),
    processes: [],
  };
  jsonWrite(stateFile, state);
  for (const mode of ["api", "web"]) {
    // Windows PowerShell waits for console-attached descendants of native
    // commands even after Node exits. Start-Process gives the worker its own
    // hidden window/stdio, so the one-command launcher actually returns.
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const launch = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$p=Start-Process -FilePath ${quote(process.execPath)} -ArgumentList ${quote('"' + worker + '" ' + mode)} -WorkingDirectory ${quote(root)} -WindowStyle Hidden -PassThru;$p.Id`,
      ],
      { env, encoding: "utf8", windowsHide: true },
    );
    if (launch.status !== 0 || !/^\d+$/.test(launch.stdout.trim()))
      fail("Background worker launch failed; inspect private logs");
    const pid = Number(launch.stdout.trim());
    const info = processInfo(pid);
    if (!info)
      fail(
        `${mode} exited before ownership could be recorded; inspect private logs`,
      );
    state.processes.push({ mode, pid, created: info.created });
    jsonWrite(stateFile, state);
  }
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      await health();
      healthy = true;
      break;
    } catch {
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
  if (!healthy)
    fail(
      "Demo did not become healthy; inspect .sprint1-demo/*.log. READY not reached.",
    );
  if (!profilePreviouslyReady) {
    runLog("demo-showtime", "node apps/api/scripts/create-demo-showtime.mjs", env);
    runLog(
      "demo-scanner-showtime",
      "node apps/api/scripts/create-demo-scanner-showtime.mjs",
      env,
    );
  } else
    console.log(
      "Demo: retaining existing showtimes, purchases, and seat state; no fixture recreation performed.",
    );
  await health();
  await smoke();
  state.readyAt = new Date().toISOString();
  jsonWrite(stateFile, state);
  ready();
} catch (error) {
  // Child/provider errors can contain env material; emit only our fixed messages.
  const message =
    error instanceof DemoError
      ? error.message
      : "Prerequisite command failed; verify Node/Corepack/Docker/Git and private logs";
  console.error("Demo failed: " + message);
  process.exitCode = 1;
}
