#!/usr/bin/env node
// S-55: authenticated restore into a specifically approved EMPTY temporary DB.
// No --clean/drop/reset; source archive is authenticated before any DB write.
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  decryptToWritable,
  dockerDatabaseUrl,
  encryptionKey,
  normalizePrefix,
  retentionPlan,
  sha256File,
} from "./s55-lib.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
};
const target = process.env.S55_RESTORE_TARGET_URL;
if (!target) throw new Error("S55_RESTORE_TARGET_URL is required");
if (process.env.S55_RESTORE_APPROVAL !== "RESTORE_S55_TO_EMPTY_TEMP_DATABASE") {
  throw new Error("S55_RESTORE_APPROVAL is missing or invalid");
}
const targetUrl = new URL(target);
const targetDatabase = decodeURIComponent(targetUrl.pathname.replace(/^\//, ""));
if (!targetDatabase || process.env.S55_RESTORE_ALLOWED_DATABASE !== targetDatabase) {
  throw new Error("S55_RESTORE_ALLOWED_DATABASE must exactly match the temporary target");
}
const localHost = ["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname);
if (!localHost && process.env.S55_RESTORE_ALLOWED_HOST !== targetUrl.hostname) {
  throw new Error("Non-local restore host is not explicitly allow-listed");
}
if (process.env.S55_DATABASE_URL && process.env.S55_DATABASE_URL === target) {
  throw new Error("Refusing to restore over the backup source database");
}

const key = encryptionKey();
const image = process.env.S55_POSTGRES_IMAGE ?? "postgres:15-alpine";
const workDir = resolve(option("--dir") ?? ".s55-runtime/restore");
await mkdir(workDir, { recursive: true, mode: 0o700 });

function childExit(child, label) {
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    if (stderr.length < 16_384) stderr += chunk.toString("utf8");
  });
  return new Promise((resolveExit, reject) => {
    child.once("error", () => reject(new Error(`${label} could not start`)));
    child.once("close", (code) =>
      code === 0 ? resolveExit() : reject(new Error(`${label} failed (exit ${code})`)),
    );
  });
}

function docker(command, { input = false, capture = false } = {}) {
  return spawn(
    "docker",
    [
      "run", "--rm", "-i",
      "--add-host=host.docker.internal:host-gateway",
      "-e", "PGDATABASE",
      image,
      ...command,
    ],
    {
      env: { ...process.env, PGDATABASE: dockerDatabaseUrl(target) },
      stdio: [input ? "pipe" : "ignore", capture ? "pipe" : "inherit", "pipe"],
    },
  );
}

function dockerQuery(sql) {
  const result = spawnSync(
    "docker",
    [
      "run", "--rm",
      "--add-host=host.docker.internal:host-gateway",
      "-e", "PGDATABASE",
      "-e", "S55_SQL",
      image,
      "sh", "-eu", "-c",
      "psql --dbname=\"$PGDATABASE\" -v ON_ERROR_STOP=1 -tA -c \"$S55_SQL\"",
    ],
    {
      env: { ...process.env, PGDATABASE: dockerDatabaseUrl(target), S55_SQL: sql },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) throw new Error("Temporary database query failed");
  return result.stdout.trim();
}

function awsArgs(command) {
  return process.env.S55_S3_ENDPOINT
    ? ["--endpoint-url", process.env.S55_S3_ENDPOINT, ...command]
    : command;
}

function aws(command, { json = false } = {}) {
  const python = process.env.S55_AWS_PYTHON;
  const executable = python || "aws";
  const commandArgs = python
    ? ["-c", "import awscli.clidriver; awscli.clidriver.main()", ...awsArgs(command)]
    : awsArgs(command);
  const result = spawnSync(executable, commandArgs, {
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("S3 operation failed");
  return json ? JSON.parse(result.stdout || "{}") : undefined;
}

function newestObject() {
  const bucket = process.env.S55_S3_BUCKET;
  if (!bucket) throw new Error("S55_S3_BUCKET is required");
  const prefix = normalizePrefix(process.env.S55_S3_PREFIX);
  const listed = aws([
    "s3api", "list-objects", "--bucket", bucket, "--prefix", `${prefix}/`, "--output", "json",
  ], { json: true });
  const { kept } = retentionPlan(listed.Contents ?? [], 1);
  if (!kept.length) throw new Error("No encrypted S-55 backup exists in storage");
  return kept[0].Key;
}

let encryptedFile = option("--file");
let downloaded = false;
let objectKey = option("--object-key");
let expectedSha;
try {
  if (!encryptedFile) {
    const bucket = process.env.S55_S3_BUCKET;
    if (!bucket) throw new Error("S55_S3_BUCKET is required");
    objectKey ||= newestObject();
    encryptedFile = resolve(workDir, basename(objectKey));
    aws(["s3", "cp", `s3://${bucket}/${objectKey}`, encryptedFile, "--only-show-errors"]);
    downloaded = true;
    const head = aws(["s3api", "head-object", "--bucket", bucket, "--key", objectKey], { json: true });
    expectedSha = head.Metadata?.sha256;
  } else {
    encryptedFile = resolve(encryptedFile);
  }
  if ((await stat(encryptedFile)).size <= 36) throw new Error("Encrypted backup is empty");
  const actualSha = await sha256File(encryptedFile);
  if (expectedSha && expectedSha !== actualSha) throw new Error("Encrypted backup checksum mismatch");

  // Authenticate the complete GCM stream and validate the archive before writing any table.
  const list = docker(["pg_restore", "--list"], { input: true, capture: true });
  await Promise.all([decryptToWritable(encryptedFile, list.stdin, key), childExit(list, "archive validation")]);

  const tableCount = Number(
    dockerQuery("SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema');"),
  );
  if (tableCount !== 0) throw new Error("Restore target is not empty; refusing to overwrite it");

  const restore = docker(
    ["sh", "-eu", "-c", "pg_restore --exit-on-error --no-owner --no-privileges --dbname=\"$PGDATABASE\""],
    { input: true },
  );
  await Promise.all([decryptToWritable(encryptedFile, restore.stdin, key), childExit(restore, "pg_restore")]);

  const counts = JSON.parse(
    dockerQuery(`SELECT json_build_object(
      'users',(SELECT count(*) FROM users),
      'orders',(SELECT count(*) FROM orders),
      'paidOrders',(SELECT count(*) FROM orders WHERE status='PAID'),
      'payments',(SELECT count(*) FROM payments),
      'soldSeats',(SELECT count(*) FROM seats WHERE "isSold"=true),
      'migrations',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)
    )::text;`),
  );
  const evidence = {
    restoredAt: new Date().toISOString(),
    source: objectKey ?? basename(encryptedFile),
    encryptedSha256: actualSha,
    targetHost: targetUrl.hostname,
    targetDatabase,
    counts,
    archiveAuthenticated: true,
    restoreExitOnError: true,
  };
  const evidenceFile = resolve(".s55-runtime/restore-evidence.json");
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`S-55 restore OK: users=${counts.users} orders=${counts.orders} paid=${counts.paidOrders} soldSeats=${counts.soldSeats}`);
} catch (error) {
  console.error(`S-55 restore failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  if (downloaded && encryptedFile) await rm(encryptedFile, { force: true });
}
