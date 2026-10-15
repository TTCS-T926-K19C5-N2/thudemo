import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  mkdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import net from "node:net";
const root = resolve(import.meta.dirname, ".."),
  c = JSON.parse(readFileSync(resolve(root, ".sprint1-local/config.json")));
const dir = resolve(root, ".sprint1-local"),
  out = resolve(
    root,
    process.env.SPRINT1_EVIDENCE_DIR ?? "evidence/sprint1/20261015-gitflow",
  );
if (!out.startsWith(resolve(root, "evidence/sprint1") + "\\"))
  throw Error("Evidence must stay within Sprint 1 directory");
mkdirSync(out, { recursive: true });
const require = createRequire(resolve(root, "apps/api/package.json"));
require("dotenv").config({ path: resolve(root, ".env"), quiet: true });
async function free(port) {
  await new Promise((done, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => s.close(done));
  });
}
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://${c.user}:${c.dbPassword}@127.0.0.1:15446/sprint2_integration?schema=public`,
  REDIS_HOST: "127.0.0.1",
  REDIS_PORT: "16396",
  SPRINT1_ISOLATED_TEST: "true",
  HOLD_EXPIRY_MODE: "off",
  ORDER_EXPIRY_MODE: "off",
  VERIFICATION_EVIDENCE_DIR: resolve(out, "integration"),
};
// Unit tests supply independent key configurations; do not inject demo keys.
for (const key of Object.keys(env))
  if (key.startsWith("SCANNER_")) delete env[key];
env.SCANNER_SIGNING_PRIVATE_KEY_FILE = "";
delete env.REDIS_URL;
env.WEB_ORIGIN = "http://localhost:3000";
env.PAYMENT_GATEWAY = "momo";
const results = [];
function run(name, cmd, args, options = {}) {
  const fd = openSync(resolve(dir, `${name}.log`), "w"),
    start = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: root,
    env,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
    ...options,
  });
  closeSync(fd);
  results.push({
    name,
    exitCode: result.status,
    seconds: (Date.now() - start) / 1000,
  });
  writeFileSync(resolve(out, "gates.json"), JSON.stringify(results, null, 2));
  console.log(name, result.status === 0 ? "PASS" : "FAIL");
  if (result.status !== 0) throw Error(`${name} failed; see private log`);
}
const existing = spawnSync("docker", ["ps", "-a", "--format", "{{.Names}}"], {
  encoding: "utf8",
}).stdout;
if (!existing.includes("sprint1-gitflow-tests-pg-20261015")) await free(15446);
if (!existing.includes("sprint1-gitflow-tests-redis-20261015"))
  await free(16396);
for (const name of [
  "sprint1-gitflow-tests-pg-20261015",
  "sprint1-gitflow-tests-redis-20261015",
  "sprint1-gitflow-tests-qr-pg-20261015",
]) {
  if (existing.split(/\r?\n/).includes(name)) {
    const item = JSON.parse(
      spawnSync("docker", ["inspect", name], { encoding: "utf8" }).stdout,
    )[0];
    if (item.Config.Labels["sprint1.review"] !== "20261015")
      throw Error("Refuse foreign test container");
  }
}
writeFileSync(
  resolve(dir, "tests-compose.json"),
  JSON.stringify(
    {
      services: {
        postgres: {
          image: "postgres:15-alpine",
          container_name: "sprint1-gitflow-tests-pg-20261015",
          ports: ["127.0.0.1:15446:5432"],
          environment: {
            POSTGRES_USER: c.user,
            POSTGRES_PASSWORD: c.dbPassword,
            POSTGRES_DB: "sprint2_integration",
          },
          labels: { "sprint1.review": "20261015" },
          volumes: ["test-db:/var/lib/postgresql/data"],
          healthcheck: {
            test: [
              "CMD-SHELL",
              `pg_isready -U ${c.user} -d sprint2_integration`,
            ],
            interval: "2s",
            timeout: "3s",
            retries: 30,
          },
        },
        redis: {
          image: "redis:7-alpine",
          container_name: "sprint1-gitflow-tests-redis-20261015",
          ports: ["127.0.0.1:16396:6379"],
          labels: { "sprint1.review": "20261015" },
          healthcheck: {
            test: ["CMD", "redis-cli", "ping"],
            interval: "2s",
            timeout: "3s",
            retries: 30,
          },
        },
      },
      volumes: { "test-db": {} },
    },
    null,
    2,
  ),
);
run("test-dependencies", "docker", [
  "compose",
  "-p",
  "sprint1-gitflow-tests-20261015",
  "-f",
  ".sprint1-local/tests-compose.json",
  "up",
  "-d",
  "--wait",
]);
run(
  "test-migration",
  "corepack",
  ["pnpm", "--filter", "api", "exec", "prisma", "migrate", "deploy"],
  { shell: true },
);
for (const name of ["lint", "typecheck", "test"])
  run(name, "corepack", ["pnpm", name], { shell: true });
run(
  "integration",
  "corepack",
  [
    "pnpm",
    "--filter",
    "api",
    "run",
    "test:e2e",
    "--exclude",
    "**/ticket-check-in.e2e-spec.ts",
  ],
  { shell: true },
);
// Scanner's existing guard allows a separate exact database/port, not 15446.
// Keep that guard intact and run its entire suite under its accepted profile.
const qrName = "sprint1-gitflow-tests-qr-pg-20261015";
if (
  !spawnSync("docker", ["ps", "-a", "--format", "{{.Names}}"], {
    encoding: "utf8",
  }).stdout.includes(qrName)
) {
  await free(15450);
  writeFileSync(
    resolve(dir, "qr-postgres.env"),
    `POSTGRES_USER=${c.user}\nPOSTGRES_PASSWORD=${c.dbPassword}\nPOSTGRES_DB=signed_qr_integration\n`,
  );
  run("qr-db-create", "docker", [
    "run",
    "-d",
    "--name",
    qrName,
    "--label",
    "sprint1.review=20261015",
    "--env-file",
    ".sprint1-local/qr-postgres.env",
    "-p",
    "127.0.0.1:15450:5432",
    "postgres:15-alpine",
  ]);
}
env.DATABASE_URL = `postgresql://${c.user}:${c.dbPassword}@127.0.0.1:15450/signed_qr_integration?schema=public`;
run(
  "qr-migration",
  "corepack",
  ["pnpm", "--filter", "api", "exec", "prisma", "migrate", "deploy"],
  { shell: true },
);
run(
  "integration-scanner",
  "corepack",
  ["pnpm", "--filter", "api", "run", "test:e2e", "ticket-check-in.e2e-spec.ts"],
  { shell: true },
);
