import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, open, rename, rm, stat } from "node:fs/promises";
import { finished, pipeline } from "node:stream/promises";

export const S55_MAGIC = Buffer.from("S55GCM01", "ascii");
export const S55_IV_BYTES = 12;
export const S55_TAG_BYTES = 16;
export const S55_HEADER_BYTES = S55_MAGIC.length + S55_IV_BYTES;
export const S55_BACKUP_RE = /^s55-\d{8}T\d{6}Z-[a-f0-9]{8}\.dump\.gcm$/;

export function encryptionKey(raw = process.env.S55_ENCRYPTION_KEY_BASE64) {
  if (!raw) throw new Error("S55_ENCRYPTION_KEY_BASE64 is required");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("S55_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes");
  }
  return key;
}

export function normalizePrefix(raw = "postgres/nightly") {
  const prefix = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.includes("..") || !/^[A-Za-z0-9/_.-]+$/.test(prefix)) {
    throw new Error("S55_S3_PREFIX is invalid");
  }
  return prefix;
}

export function backupName(date = new Date(), suffix = randomBytes(4).toString("hex")) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `s55-${stamp}-${suffix}.dump.gcm`;
}

export function retentionPlan(objects, keep = 14) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error("keep must be a positive integer");
  const backups = objects
    .filter((item) => typeof item?.Key === "string" && S55_BACKUP_RE.test(item.Key.split("/").at(-1)))
    .sort((a, b) => {
      const byTime = Date.parse(a.LastModified ?? 0) - Date.parse(b.LastModified ?? 0);
      return byTime || a.Key.localeCompare(b.Key);
    });
  return {
    kept: backups.slice(Math.max(0, backups.length - keep)),
    pruned: backups.slice(0, Math.max(0, backups.length - keep)),
  };
}

export async function encryptReadable(readable, destination, key) {
  const temporary = `${destination}.partial`;
  const iv = randomBytes(S55_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const output = createWriteStream(temporary, { flags: "wx", mode: 0o600 });
  try {
    output.write(Buffer.concat([S55_MAGIC, iv]));
    await pipeline(readable, cipher, output, { end: false });
    output.end(cipher.getAuthTag());
    await finished(output);
    await rename(temporary, destination);
  } catch (error) {
    output.destroy();
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function decryptToWritable(source, writable, key) {
  const size = (await stat(source)).size;
  if (size <= S55_HEADER_BYTES + S55_TAG_BYTES) throw new Error("Encrypted backup is truncated");
  const handle = await open(source, "r");
  try {
    const header = Buffer.alloc(S55_HEADER_BYTES);
    const tag = Buffer.alloc(S55_TAG_BYTES);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, size - tag.length);
    if (!header.subarray(0, S55_MAGIC.length).equals(S55_MAGIC)) {
      throw new Error("Encrypted backup format is not S55GCM01");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      header.subarray(S55_MAGIC.length),
    );
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(source, { start: S55_HEADER_BYTES, end: size - S55_TAG_BYTES - 1 }),
      decipher,
      writable,
    );
  } finally {
    await handle.close();
  }
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

export function dockerDatabaseUrl(raw, { host } = {}) {
  const url = new URL(raw);
  // Prisma accepts these client-only query options; libpq tools reject them.
  for (const option of ["schema", "connection_limit", "pool_timeout"]) {
    url.searchParams.delete(option);
  }
  const target = host ?? process.env.S55_DB_HOST;
  if (target) {
    // Compose services resolve each other by name; the Linux Docker Desktop VM
    // cannot route host.docker.internal back to published ports in every
    // setup, so an explicit compose hostname wins when provided.
    url.hostname = target;
  } else if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    url.hostname = "host.docker.internal";
  }
  return url.toString();
}
