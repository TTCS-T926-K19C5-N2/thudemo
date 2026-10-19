import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
} from "node:fs";
import { spawnSync, execFileSync, spawn } from "node:child_process";
import { randomBytes, generateKeyPairSync, createHash } from "node:crypto";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import net from "node:net";
const root = process.cwd(),
  source = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  stamp = Date.now(),
  dir = `D:/s1ac/${source.slice(0, 8)}-${stamp}`;
assert(!existsSync(dir));
mkdirSync(dir, { recursive: true });
const preflight = {
  time: new Date().toISOString(),
  source,
  systemFree: JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-PSDrive C,D | Select-Object Name,@{n='freeGiB';e={[math]::Round($_.Free/1GB,2)}} | ConvertTo-Json",
      ],
      { encoding: "utf8" },
    ),
  ),
  memory: JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize | ConvertTo-Json",
      ],
      { encoding: "utf8" },
    ),
  ),
};
assert(preflight.systemFree.every((x) => x.freeGiB > 12));
assert(preflight.memory.FreePhysicalMemory > 1_500_000);
const run = (name, cmd, args, opts = {}) => {
  const fd = openSync(resolve(dir, name + ".log"), "w");
  const r = spawnSync(cmd, args, {
    cwd: dir,
    windowsHide: true,
    stdio: ["ignore", fd, fd],
    ...opts,
  });
  closeSync(fd);
  assert.equal(r.status, 0, `${name} failed; private log ${dir}/${name}.log`);
};
run("archive", "git", [
  "-C",
  root,
  "archive",
  "HEAD",
  "-o",
  resolve(dir, "source.tar"),
]);
run("extract", "tar", ["-xf", "source.tar"]);
const lock = () =>
    createHash("sha256")
      .update(readFileSync(resolve(dir, "pnpm-lock.yaml")))
      .digest("hex"),
  before = lock();
for (const port of [3480, 3481])
  await new Promise((done, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => s.close(done));
  });
const c = JSON.parse(readFileSync(".sprint1-local/config.json")),
  container = "sprint1-gitflow-tests-pg-20261015";
for (const name of [container, "sprint1-gitflow-tests-redis-20261015"]) {
  const i = JSON.parse(
    execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
  )[0];
  assert.equal(i.Config.Labels["sprint1.review"], "20261015");
  assert(i.State.Running);
}
const database = "sprint1_clean_native_" + stamp;
const p = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    c.user,
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  {
    input: `CREATE DATABASE ${database};`,
    encoding: "utf8",
    windowsHide: true,
  },
);
assert.equal(p.status, 0);
const secret = () => randomBytes(24).toString("base64url"),
  keys = generateKeyPairSync("ed25519");
mkdirSync(resolve(dir, ".sprint1-local"));
writeFileSync(
  resolve(dir, ".sprint1-local/signing.pem"),
  keys.privateKey.export({ type: "pkcs8", format: "pem" }),
);
writeFileSync(
  resolve(dir, ".env"),
  [
    `DATABASE_URL=postgresql://${c.user}:${c.dbPassword}@127.0.0.1:15446/${database}`,
    `REDIS_HOST=127.0.0.1`,
    `REDIS_PORT=16396`,
    `PORT=3481`,
    `WEB_PORT=3480`,
    `WEB_ORIGIN=http://localhost:3480`,
    `API_INTERNAL_URL=http://127.0.0.1:3481`,
    `AUTH_PROXY_SECRET=${secret()}`,
    `PAYMENT_GATEWAY=mock`,
    `PAYMENT_WEBHOOK_SECRET=${secret()}`,
    `SCANNER_KEY_ID=sprint1-clean-native`,
    `SCANNER_SIGNING_PRIVATE_KEY_FILE=${dir}/.sprint1-local/signing.pem`,
    `SCANNER_PUBLIC_KEYS='${JSON.stringify({ "sprint1-clean-native": keys.publicKey.export({ type: "spki", format: "pem" }) })}'`,
    `ORDER_EXPIRY_MODE=off`,
    `HOLD_EXPIRY_MODE=off`,
  ].join("\n"),
);
const env = { ...process.env };
for (const k of Object.keys(env))
  if (
    /^(DATABASE_|REDIS_|SCANNER_|AUTH_|PAYMENT_|MOMO_|WEB_|API_|NODE_ENV|APP_ENV|PORT$|ORDER_EXPIRY|HOLD_EXPIRY)/.test(
      k,
    )
  )
    delete env[k];
run(
  "frozen-install",
  "corepack.cmd",
  ["pnpm", "install", "--frozen-lockfile"],
  { shell: true, env },
);
assert.equal(lock(), before);
run(
  "migrate",
  "corepack.cmd",
  ["pnpm", "--filter", "api", "exec", "prisma", "migrate", "deploy"],
  { shell: true, env },
);
run(
  "generate",
  "corepack.cmd",
  ["pnpm", "--filter", "api", "exec", "prisma", "generate"],
  { shell: true, env },
);
run("build", "corepack.cmd", ["pnpm", "build"], { shell: true, env });
const processes = [];
try {
  for (const [name, cwd, args, extra] of [
    [
      "api",
      resolve(dir, "apps/api"),
      ["--env-file=../../.env", "dist/main.js"],
      {},
    ],
    [
      "web",
      resolve(dir, "apps/web"),
      ["--env-file=../../.env", "server.mjs"],
      { NODE_ENV: "production" },
    ],
  ]) {
    const fd = openSync(resolve(dir, name + ".log"), "w");
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...env, ...extra },
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    });
    closeSync(fd);
    processes.push({ name, child });
  }
  const smoke = [];
  for (const url of [
    "http://127.0.0.1:3481/health",
    "http://127.0.0.1:3480/",
    "http://127.0.0.1:3480/api/health",
  ]) {
    let ok = false;
    for (let n = 0; n < 120; n++) {
      assert(
        processes.every((x) => x.child.exitCode === null),
        "Owned child exited; inspect private logs",
      );
      try {
        const r = await fetch(url);
        if (r.status === 200) {
          ok = true;
          smoke.push({ url, status: 200 });
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    assert(ok, "Clean native readiness");
  }
  const query = execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      c.user,
      "-d",
      database,
      "-tAc",
      "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL",
    ],
    { encoding: "utf8" },
  ).trim();
  assert.equal(query, "29");
  writeFileSync(
    resolve(
      root,
      "evidence/sprint1/20261016-acceptance-audit/clean-native.json",
    ),
    JSON.stringify(
      {
        preflight,
        result: "PASS",
        source,
        sourceArchive: dir,
        pristineGitArchive: true,
        rootEnvOnly: true,
        frozenInstall: true,
        lockHashBefore: before,
        lockHashAfter: lock(),
        migrationsApplied: 29,
        database,
        smoke,
        nativeProcesses: processes.map((x) => ({
          name: x.name,
          pid: x.child.pid,
        })),
        dependencyPorts: { postgres: 15446, redis: 16396 },
        sourcePortsOverriddenForIsolation: true,
        conditions:
          "README install/migrate/generate/native API + web order; dedicated clean DB on owned Compose dependencies. Used compiled native processes after pnpm build. Explicit local key/fixture config; not QR/payment acceptance. Standard 3000/3001/5432/6379 ports preserved in documentation; test ports checked free.",
        cleanUp:
          "Only these two child processes stopped; DB/container/volumes preserved, no existing data edited",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS pristine source frozen install / generate / 29 migrations / build / native API+web+proxy200",
  );
} finally {
  for (const p of processes) {
    if (p.child.exitCode === null) p.child.kill();
  }
}
