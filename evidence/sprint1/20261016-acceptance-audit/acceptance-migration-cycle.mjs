import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = process.cwd(),
  req = createRequire(resolve(root, "apps/api/package.json"));
const c = JSON.parse(readFileSync(".sprint1-local/config.json"));
const container = "sprint1-gitflow-tests-pg-20261015";
const inspected = JSON.parse(
  execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
)[0];
assert.equal(inspected.Config.Labels["sprint1.review"], "20261015");
assert(inspected.State.Running);
const database = "sprint1_acceptance_cycle_" + Date.now(),
  dir = resolve(".sprint1-local", database);
assert.match(database, /^sprint1_acceptance_cycle_\d+$/);
const sql = (db, s) => {
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      c.user,
      "-d",
      db,
      "-tA",
    ],
    { input: s, encoding: "utf8", windowsHide: true },
  );
  assert.equal(r.status, 0, "psql failed; no reset or retry");
  return r.stdout.trim();
};
assert.equal(
  sql(
    "postgres",
    `SELECT count(*) FROM pg_database WHERE datname='${database}'`,
  ),
  "0",
);
sql("postgres", `CREATE DATABASE ${database}`);
mkdirSync(resolve(dir, "migrations"), { recursive: true });
const config = resolve(dir, "cycle.config.mjs");
writeFileSync(
  config,
  `import {defineConfig} from ${JSON.stringify(pathToFileURL(req.resolve("prisma/config")).href)};export default defineConfig({schema:${JSON.stringify(resolve("apps/api/prisma/schema.prisma"))},migrations:{path:${JSON.stringify(resolve(dir, "migrations"))}},datasource:{url:process.env.DATABASE_URL}});`,
);
const original = [
  "202609290001_t01_probe_apply",
  "202609290002_t01_probe_compensate",
  "202609290003_t01_probe_reapply",
  "202610010001_t04_users_roles",
  "202610010002_t09_events_showtimes",
];
const source = resolve("apps/api/prisma/migrations");
const hashes = original.map((name) => ({
  name,
  sha256: createHash("sha256")
    .update(readFileSync(resolve(source, name, "migration.sql")))
    .digest("hex"),
}));
const steps = [];
const apply = (label) => {
  const fd = openSync(resolve(dir, label + ".log"), "w");
  const r = spawnSync(
    process.execPath,
    [
      req.resolve("prisma/build/index.js"),
      "migrate",
      "deploy",
      "--config",
      config,
    ],
    {
      cwd: resolve("apps/api"),
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://${c.user}:${c.dbPassword}@127.0.0.1:15446/${database}`,
      },
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    },
  );
  closeSync(fd);
  assert.equal(r.status, 0, label);
  return sql(
    database,
    "SELECT json_build_object('users',to_regclass('public.users') IS NOT NULL,'roles',to_regclass('public.roles') IS NOT NULL,'user_roles',to_regclass('public.user_roles') IS NOT NULL,'events',to_regclass('public.events') IS NOT NULL,'showtimes',to_regclass('public.showtimes') IS NOT NULL,'probe',to_regclass('public.t01_migration_probe') IS NOT NULL)",
  );
};
for (const name of original)
  cpSync(resolve(source, name), resolve(dir, "migrations", name), {
    recursive: true,
  });
let state = JSON.parse(apply("apply"));
assert(state.users && state.events && state.showtimes);
steps.push({ phase: "apply", state, result: "PASS" });
const guard = `DO $$ BEGIN IF current_database() <> '${database}' THEN RAISE EXCEPTION 'New isolated cycle DB only'; END IF; END $$;\n`;
const extra = [
  [
    "202610160001_t09_compensate",
    guard + "DROP TABLE showtimes; DROP TABLE events;",
  ],
  [
    "202610160002_t04_compensate",
    guard + "DROP TABLE user_roles; DROP TABLE roles; DROP TABLE users;",
  ],
  [
    "202610160003_t04_reapply",
    readFileSync(resolve(source, original[3], "migration.sql"), "utf8"),
  ],
  [
    "202610160004_t09_reapply",
    readFileSync(resolve(source, original[4], "migration.sql"), "utf8"),
  ],
];
for (const [name, content] of extra) {
  mkdirSync(resolve(dir, "migrations", name));
  writeFileSync(resolve(dir, "migrations", name, "migration.sql"), content);
  state = JSON.parse(apply(name));
  if (name.includes("t09_compensate"))
    assert(!state.events && !state.showtimes && state.users);
  if (name.includes("t04_compensate"))
    assert(!state.users && !state.roles && !state.user_roles && !state.events);
  if (name.includes("t04_reapply"))
    assert(state.users && state.roles && state.user_roles && !state.events);
  if (name.includes("t09_reapply"))
    assert(state.users && state.events && state.showtimes);
  steps.push({ phase: name, state, result: "PASS" });
}
const migrationNames = sql(
  database,
  "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name",
).split(/\r?\n/);
assert.equal(migrationNames.length, 9);
const report = {
  time: new Date().toISOString(),
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  environment:
    "Owned local PG15 test container, brand-new empty database; not the staging data",
  database,
  container,
  result: "PASS",
  steps,
  migrationNames,
  originalSqlHashes: hashes,
  resetOrDbPushOrDatabaseDrop: false,
  appliedProductMigrationFilesEdited: false,
  limitation:
    "Compensation drops only newly created empty business tables in this isolated verification DB; never an operational downgrade of staging or later-story schema. Full 29-migration fresh-chain proof is separate.",
};
mkdirSync("evidence/sprint1/20261016-acceptance-audit", { recursive: true });
writeFileSync(
  "evidence/sprint1/20261016-acceptance-audit/migration-cycle.json",
  JSON.stringify(report, null, 2),
);
console.log(
  "PASS fresh Prisma apply / T09 compensation / T04 compensation / T04 reapply / T09 reapply; all intermediate states verified",
);
