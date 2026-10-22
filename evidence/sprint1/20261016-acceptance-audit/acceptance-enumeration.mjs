import https from "node:https";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const c = JSON.parse(readFileSync(".sprint1-staging/config.json")),
  a = JSON.parse(readFileSync(".sprint1-staging/active.json")),
  actor = c.accounts.find((x) => x.email.startsWith("lock-test@")),
  origin = `https://${c.lanAddress}:3470`,
  ca = readFileSync(".sprint1-staging/tls/server-cert.pem");
const call = (path, body, cookie) =>
  new Promise((done, reject) => {
    const q = https.request(
      origin + path,
      {
        method: "POST",
        ca,
        rejectUnauthorized: true,
        agent: false,
        headers: {
          origin,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
      },
      (r) => {
        const chunks = [];
        r.on("data", (b) => chunks.push(b));
        r.on("end", () =>
          done({
            status: r.statusCode,
            body: Buffer.concat(chunks).toString(),
            cookie: r.headers["set-cookie"]?.[0]?.split(";")[0],
          }),
        );
      },
    );
    q.on("error", reject);
    q.end(JSON.stringify(body));
  });
let ok = await call("/api/auth/login", actor);
assert.equal(ok.status, 200);
assert.equal((await call("/api/auth/logout", {}, ok.cookie)).status, 200);
const password = randomUUID(),
  wrong = await call("/api/auth/login", { email: actor.email, password }),
  unknown = await call("/api/auth/login", {
    email: `unknown-${randomUUID()}@demo.invalid`,
    password,
  });
assert.equal(wrong.status, 401);
assert.equal(unknown.status, 401);
assert.equal(wrong.body, unknown.body);
assert(!wrong.body.includes(actor.email));
assert(!wrong.body.includes(password));
ok = await call("/api/auth/login", actor);
assert.equal(ok.status, 200);
assert.equal((await call("/api/auth/logout", {}, ok.cookie)).status, 200);
writeFileSync(
  "evidence/sprint1/20261016-acceptance-audit/enumeration.json",
  JSON.stringify(
    {
      time: new Date().toISOString(),
      source: a.sha,
      origin,
      result: "PASS",
      case: "unknown-email-and-wrong-password-same-error",
      wrongStatus: wrong.status,
      unknownStatus: unknown.status,
      response: JSON.parse(wrong.body),
      sameResponse: true,
      existingAccountRecoveredLogin200: true,
      failures: 2,
      scope:
        "One wrong-password and one nonexistent-email request, only the dedicated fixture. No repeated IP limit probe or lockout test; real account counter recovered by successful login.",
    },
    null,
    2,
  ),
);
console.log(
  "PASS real HTTPS unknown-email/wrong-password identical401 response; dedicated fixture recovered",
);
