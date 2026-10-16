#!/usr/bin/env node
// S-55: pg_dump -> AES-256-GCM stream -> private S3-compatible storage.
// Secrets are accepted only through environment variables and never logged.
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  backupName,
  decryptToWritable,
  dockerDatabaseUrl,
  encryptionKey,
  encryptReadable,
  normalizePrefix,
  retentionPlan,
  sha256File,
} from "./s55-lib.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const localOnly = args.includes("--local-only");
const keep = Number.parseInt(option("--keep", "14"), 10);
if (!Number.isInteger(keep) || keep < 1) throw new Error("--keep must be a positive integer");

const databaseUrl = process.env.S55_DATABASE_URL ?? process.env.PGDATABASE;
if (!databaseUrl) throw new Error("S55_DATABASE_URL is required");
const key = encryptionKey();
const image = process.env.S55_POSTGRES_IMAGE ?? "postgres:15-alpine";
const outputDir = resolve(option("--dir", ".s55-runtime/backups"));
const fileName = backupName();
const encryptedFile = join(outputDir, fileName);
const keyId = process.env.S55_KEY_ID ?? "primary";
if (!/^[A-Za-z0-9_.-]{1,64}$/.test(keyId)) throw new Error("S55_KEY_ID is invalid");

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

function postgresContainer(command, database, stdio = ["ignore", "pipe", "pipe"]) {
  return spawn(
    "docker",
    [
      "run", "--rm", "-i",
      "--add-host=host.docker.internal:host-gateway",
      "-e", "PGDATABASE",
      image,
      ...command,
    ],
    { env: { ...process.env, PGDATABASE: dockerDatabaseUrl(database) }, stdio },
  );
}

function awsArgs(command) {
  const endpoint = process.env.S55_S3_ENDPOINT;
  return endpoint ? ["--endpoint-url", endpoint, ...command] : command;
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

async function validateArchive(file) {
  const restore = postgresContainer(["pg_restore", "--list"], databaseUrl, ["pipe", "ignore", "pipe"]);
  await Promise.all([decryptToWritable(file, restore.stdin, key), childExit(restore, "pg_restore --list")]);
}

async function pruneLocal() {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(outputDir, { withFileTypes: true });
  const objects = await Promise.all(
    entries.filter((entry) => entry.isFile()).map(async (entry) => ({
      Key: entry.name,
      LastModified: (await stat(join(outputDir, entry.name))).mtime.toISOString(),
    })),
  );
  const { pruned } = retentionPlan(objects, keep);
  await Promise.all(pruned.map((item) => rm(join(outputDir, item.Key), { force: true })));
}

async function uploadAndRetain(file, sha256) {
  const bucket = process.env.S55_S3_BUCKET;
  if (!bucket) throw new Error("S55_S3_BUCKET is required");
  const prefix = normalizePrefix(process.env.S55_S3_PREFIX);
  const objectKey = `${prefix}/${fileName}`;
  const uri = `s3://${bucket}/${objectKey}`;
  aws([
    "s3", "cp", file, uri, "--only-show-errors",
    "--content-type", "application/octet-stream",
    "--metadata", `sha256=${sha256},key-id=${keyId},format=s55gcm01`,
  ]);
  const head = aws(["s3api", "head-object", "--bucket", bucket, "--key", objectKey], { json: true });
  if (Number(head.ContentLength) <= 36 || head.Metadata?.sha256 !== sha256) {
    throw new Error("Uploaded backup verification failed");
  }

  const listed = aws([
    "s3api", "list-objects", "--bucket", bucket, "--prefix", `${prefix}/`,
    "--output", "json",
  ], { json: true });
  const { kept, pruned } = retentionPlan(listed.Contents ?? [], keep);
  for (const old of pruned) {
    aws(["s3api", "delete-object", "--bucket", bucket, "--key", old.Key]);
  }
  return { objectKey, retained: kept.length, pruned: pruned.length };
}

await mkdir(outputDir, { recursive: true, mode: 0o700 });
let dump;
try {
  dump = postgresContainer(
    [
      "sh", "-eu", "-c",
      "pg_dump --format=custom --compress=6 --no-owner --no-acl --dbname=\"$PGDATABASE\"",
    ],
    databaseUrl,
  );
  await Promise.all([encryptReadable(dump.stdout, encryptedFile, key), childExit(dump, "pg_dump")]);
  await validateArchive(encryptedFile);
  const sha256 = await sha256File(encryptedFile);
  const size = (await stat(encryptedFile)).size;
  if (size <= 36) throw new Error("Encrypted backup is empty");

  let remote = { objectKey: null, retained: 0, pruned: 0 };
  if (!localOnly) remote = await uploadAndRetain(encryptedFile, sha256);
  await pruneLocal();
  const manifest = {
    format: "S55GCM01",
    file: fileName,
    objectKey: remote.objectKey,
    encryptedBytes: size,
    encryptedSha256: sha256,
    keyId,
    keep,
    createdAt: new Date().toISOString(),
  };
  const manifestFile = resolve(".s55-runtime/last-backup.json");
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  if (process.env.GITHUB_OUTPUT && remote.objectKey) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_OUTPUT, `object_key=${remote.objectKey}\n`);
  }
  console.log(
    `S-55 backup OK: encrypted=${size} bytes sha256=${sha256.slice(0, 12)}…` +
      (remote.objectKey ? ` remote=${remote.objectKey} retained=${remote.retained}/${keep} pruned=${remote.pruned}` : " local-only"),
  );
} catch (error) {
  await rm(encryptedFile, { force: true });
  console.error(`S-55 backup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
