import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function prepareTicketKey(dir) {
  const path = resolve(dir, "ticket-signing.der.b64");
  if (!existsSync(path)) {
    const pair = generateKeyPairSync("ed25519");
    writeFileSync(
      path,
      pair.privateKey
        .export({ type: "pkcs8", format: "der" })
        .toString("base64"),
      { flag: "wx" },
    );
  }
  return ticketKeyEnv(dir);
}
export function ticketKeyEnv(dir) {
  const raw = readFileSync(
    resolve(dir, "ticket-signing.der.b64"),
    "utf8",
  ).trim();
  const key = createPrivateKey({
    key: Buffer.from(raw, "base64"),
    type: "pkcs8",
    format: "der",
  });
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("Staging ticket key must be Ed25519");
  return {
    TICKET_SIGNING_ACTIVE_KEY_ID: "sprint1-staging-ticket",
    TICKET_SIGNING_PRIVATE_KEY: raw,
    TICKET_SIGNING_PUBLIC_KEYS: JSON.stringify({
      "sprint1-staging-ticket": createPublicKey(key)
        .export({ type: "spki", format: "der" })
        .toString("base64"),
    }),
  };
}
export function requireMigrationReview(activeSha, changed, reviewedFrom) {
  if (!changed.trim()) return;
  if (!activeSha || reviewedFrom !== activeSha)
    throw new Error(
      "New migrations require explicit exact previous SHA review; inspect SQL and backup compatibility before manual deployment",
    );
}
export function parseProcessIdentity(result) {
  if (result.status !== 0 || result.error)
    throw new Error(
      "Cannot verify Windows process identity; refusing lifecycle action",
    );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
