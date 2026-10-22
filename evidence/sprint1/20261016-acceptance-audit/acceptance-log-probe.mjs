import assert from "node:assert/strict";
import https from "node:https";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const c = JSON.parse(readFileSync(".sprint1-staging/config.json")),
  a = JSON.parse(readFileSync(".sprint1-staging/active.json"));
const origin = `https://${c.lanAddress}:3470`,
  ca = readFileSync(".sprint1-staging/tls/server-cert.pem"),
  start = new Date().toISOString();
const markers = [
  "pii-" + randomUUID() + "@demo.invalid",
  "fake-session-" + randomUUID(),
  "fake-payment-" + randomUUID(),
];
const req = (path, method = "GET", body, cookie, extra = {}) =>
  new Promise((done, reject) => {
    const r = https.request(
      origin + path,
      {
        method,
        ca,
        rejectUnauthorized: true,
        agent: false,
        headers: {
          origin,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...extra,
        },
      },
      (res) => {
        res.resume();
        res.once("end", () =>
          done({
            status: res.statusCode,
            cookie: res.headers["set-cookie"]?.[0]?.split(";")[0],
          }),
        );
      },
    );
    r.once("error", reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });
const cases = [],
  sensitive = [
    ...markers,
    c.dbPassword,
    c.authProxySecret,
    ...c.accounts.flatMap((x) => [x.email, x.password]),
  ];
for (const [role, expected] of [
  ["organizer-a", 400],
  ["buyer", 403],
]) {
  const actor = c.accounts.find((x) => x.email.startsWith(role + "@"));
  assert(actor);
  const l = await req("/api/auth/login", "POST", {
    email: actor.email,
    password: actor.password,
  });
  assert.equal(l.status, 200);
  sensitive.push(l.cookie, l.cookie.split("=")[1]);
  try {
    const r = await req(
      "/api/events",
      "POST",
      { description: markers[0], location: markers[2] },
      l.cookie,
      { "x-test-token": markers[1] },
    );
    assert.equal(r.status, expected);
    cases.push({
      case:
        role === "buyer"
          ? "role-denial-with-fake-sensitive-input"
          : "validation-error-with-fake-sensitive-input",
      status: r.status,
      result: "PASS",
    });
  } finally {
    assert.equal(
      (await req("/api/auth/logout", "POST", {}, l.cookie)).status,
      200,
    );
  }
}
assert.equal(
  (await req("/api/auth/me", "GET", undefined, `session=${markers[1]}`)).status,
  401,
);
cases.push({ case: "invalid-session", status: 401, result: "PASS" });
const scans = [];
let denial = false;
for (const name of [a.apiContainer, a.apiReplicaContainer, a.webContainer]) {
  const i = JSON.parse(
    execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
  )[0];
  assert.equal(i.Config.Labels["sprint1.staging"], "20261015");
  const p = spawnSync("docker", ["logs", "--since", start, name], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(p.status, 0);
  const logs = p.stdout + "\n" + p.stderr;
  assert(
    !sensitive.some((s) => s && logs.includes(s)),
    "Sensitive literal in log; inspect privately",
  );
  if (logs.includes("Access denied to route")) denial = true;
  scans.push({
    container: name,
    source: i.Config.Labels["org.opencontainers.image.revision"],
    bytes: Buffer.byteLength(logs),
    sha256: createHash("sha256").update(logs).digest("hex"),
    sensitiveLiteralMatches: 0,
  });
}
assert(denial, "Meaningful denied-call log must remain");
const gatewayScans = [
  ".sprint1-staging/logs/gateway.out.log",
  ".sprint1-staging/logs/gateway.err.log",
].map((path) => {
  const b = readFileSync(path, "utf8");
  assert(!sensitive.some((s) => s && b.includes(s)));
  return {
    path,
    bytes: Buffer.byteLength(b),
    sha256: createHash("sha256").update(b).digest("hex"),
    sensitiveLiteralMatches: 0,
  };
});
writeFileSync(
  "evidence/sprint1/20261016-acceptance-audit/log-probe.json",
  JSON.stringify(
    {
      time: new Date().toISOString(),
      since: start,
      source: a.sha,
      candidate: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      origin,
      result: "PASS",
      cases,
      scans,
      gatewayScans,
      denialLogPresent: denial,
      markersPublished: false,
      limitations: [
        "Sprint1 login/logout, validation/denial and session paths only; no acceptance of future payment/QR/email workflows",
        "No failed-login/IP-lock probe, no external telemetry configured; no claim of exhaustive whole-product PII assurance",
      ],
    },
    null,
    2,
  ),
);
console.log(
  "PASS real HTTPS Sprint1 success/error/role/session paths; API replicas, web and gateway logs have zero tested sensitive literals",
);
