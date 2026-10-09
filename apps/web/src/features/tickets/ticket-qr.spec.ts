import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import {
  importTicketPublicKeys,
  parseTicketQr,
  verifyTicketQr,
  type TicketPublicKey,
} from "./ticket-qr";

// Same vector as apps/api/src/tickets/ticket-qr.spec.ts: produced by the
// API signer, so this proves the scanner accepts what the API issues.
const API_VECTOR = {
  keyId: "k1",
  publicKey: "MCowBQYDK2VwAyEAGX9rI+FshTLGq8g4+s1ep4m+DHaykgM0A5v6iz02jWE=",
  qr: "v1.k1.AbCdEfGhIjKlMnOpQrStUv.11111111-1111-4111-8111-111111111111.JoXt5VfMXa37LHcTCundi7kCSTABJlocpSP61-XQ66A8q1kSR5LbwyhMoUARfiXF6RIXhdbCeB59l6v1PPTUDw",
};

const SHOWTIME_ID = "11111111-1111-4111-8111-111111111111";
const BASE64URL_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function newKey(keyId: string) {
  const pair = generateKeyPairSync("ed25519");
  const publicKey: TicketPublicKey = {
    keyId,
    publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
  return { keyId, privateKey: pair.privateKey, publicKey };
}

function issue(keyId: string, privateKey: KeyObject, code = "AbCdEfGhIjKlMnOpQrStUv") {
  const input = `v1.${keyId}.${code}.${SHOWTIME_ID}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString("base64url")}`;
}

describe("verifyTicketQr (scanner, offline)", () => {
  it("accepts a QR issued by the API", async () => {
    const keys = await importTicketPublicKeys([API_VECTOR]);

    const result = await verifyTicketQr(API_VECTOR.qr, keys);

    expect(result).toEqual({
      valid: true,
      ticket: expect.objectContaining({
        keyId: "k1",
        code: "AbCdEfGhIjKlMnOpQrStUv",
        showtimeId: SHOWTIME_ID,
      }),
    });
  });

  it("rejects the QR when any single character is changed", async () => {
    const keys = await importTicketPublicKeys([API_VECTOR]);
    const qr = API_VECTOR.qr;
    const accepted: string[] = [];

    for (let i = 0; i < qr.length; i++) {
      for (const replacement of [BASE64URL_CHARS[0], BASE64URL_CHARS[63], "."]) {
        if (qr[i] === replacement) continue;
        const tampered = qr.slice(0, i) + replacement + qr.slice(i + 1);
        if ((await verifyTicketQr(tampered, keys)).valid) accepted.push(tampered);
      }
    }

    expect(accepted).toEqual([]);
  });

  it("rejects a non-canonical signature that decodes to the same bytes", async () => {
    const keys = await importTicketPublicKeys([API_VECTOR]);
    const index = BASE64URL_CHARS.indexOf(API_VECTOR.qr.at(-1)!);
    const tampered = API_VECTOR.qr.slice(0, -1) + BASE64URL_CHARS[index ^ 0b01];

    expect(await verifyTicketQr(tampered, keys)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("rejects a self-made QR with a valid ticket code but no or fake signature", async () => {
    const keys = await importTicketPublicKeys([API_VECTOR]);
    const unsigned = API_VECTOR.qr.slice(0, API_VECTOR.qr.lastIndexOf("."));
    const fake = `${unsigned}.${Buffer.alloc(64, 7).toString("base64url")}`;

    expect(await verifyTicketQr(unsigned, keys)).toEqual({ valid: false, reason: "MALFORMED" });
    expect(await verifyTicketQr(`${unsigned}.`, keys)).toEqual({ valid: false, reason: "MALFORMED" });
    expect(await verifyTicketQr("AbCdEfGhIjKlMnOpQrStUv", keys)).toEqual({
      valid: false,
      reason: "MALFORMED",
    });
    expect(await verifyTicketQr(fake, keys)).toEqual({ valid: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a QR signed with a key outside the downloaded list", async () => {
    const keys = await importTicketPublicKeys([API_VECTOR]);
    const attacker = newKey("k9");

    expect(await verifyTicketQr(issue("k9", attacker.privateKey), keys)).toEqual({
      valid: false,
      reason: "UNKNOWN_KEY",
    });
    expect(await verifyTicketQr(issue("k1", attacker.privateKey), keys)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("keeps tickets signed with a retired key valid after rotation", async () => {
    const k2 = newKey("k2");
    const keys = await importTicketPublicKeys([API_VECTOR, k2.publicKey]);

    expect((await verifyTicketQr(API_VECTOR.qr, keys)).valid).toBe(true);
    expect((await verifyTicketQr(issue("k2", k2.privateKey), keys)).valid).toBe(true);
    expect((await verifyTicketQr(API_VECTOR.qr.replace(".k1.", ".k2."), keys)).valid).toBe(false);
  });

  it("skips public keys that cannot be imported", async () => {
    const keys = await importTicketPublicKeys([
      API_VECTOR,
      { keyId: "broken", publicKey: "bm90LWEta2V5" },
      { keyId: "bad.id", publicKey: API_VECTOR.publicKey },
    ]);

    expect([...keys.keys()]).toEqual(["k1"]);
  });

  it("parses only the exact five-part format", () => {
    expect(parseTicketQr(API_VECTOR.qr)).not.toBeNull();
    expect(parseTicketQr(`${API_VECTOR.qr}.extra`)).toBeNull();
    expect(parseTicketQr(API_VECTOR.qr.replace(/^v1\./, "v2."))).toBeNull();
  });
});
