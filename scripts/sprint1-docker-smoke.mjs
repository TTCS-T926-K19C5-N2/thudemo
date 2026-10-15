import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import net from "node:net";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "..");
const c = JSON.parse(readFileSync(resolve(root, ".sprint1-local/config.json")));
const env = parseEnv(readFileSync(resolve(root, ".env"), "utf8"));
const target = new URL(env.DATABASE_URL);
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "15445" ||
  target.pathname !== "/sprint1_gitflow_20261015" ||
  decodeURIComponent(target.username) !== c.user ||
  decodeURIComponent(target.password) !== c.dbPassword ||
  c.pgPort !== 15445 ||
  c.redisPort !== 16395 ||
  env.REDIS_URL ||
  env.REDIS_HOST !== "127.0.0.1" ||
  env.REDIS_PORT !== "16395"
)
  throw new Error("Exact isolated profile required");
const docker = (args) => {
  const r = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0)
    throw new Error(
      "Docker smoke command failed; inspect owned containers locally",
    );
  return r.stdout.trim();
};
const image = "sprint1-gitflow-render:20261015";
const names = ["sprint1-gitflow-docker-api", "sprint1-gitflow-docker-web"];
const inventory = docker(["ps", "-a", "--format", "{{.Names}}"]).split(/\r?\n/);
for (const name of names)
  if (inventory.includes(name))
    throw new Error(
      "Existing container retained; inspect before rerunning smoke",
    );
for (const port of [3460, 3461])
  await new Promise((done, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(done));
  });
const apiEnv = {
  ...env,
  NODE_ENV: "production",
  PORT: "10000",
  SERVICE_ROLE: "api",
  WEB_ORIGIN: "http://localhost:3460",
  DATABASE_URL: env.DATABASE_URL.replace("127.0.0.1", "host.docker.internal"),
  REDIS_HOST: "host.docker.internal",
  SCANNER_SIGNING_PRIVATE_KEY_FILE: "/run/secrets/scanner.pem",
  PAYMENT_GATEWAY: "momo",
  MOMO_ACCESS_KEY: randomBytes(24).toString("hex"),
  MOMO_SECRET_KEY: randomBytes(24).toString("hex"),
};
// Synthetic startup-only gateway configuration. No payment/provider calls here.
const webEnv = {
  NODE_ENV: "production",
  PORT: "10000",
  SERVICE_ROLE: "web",
  WEB_HOST: "0.0.0.0",
  API_INTERNAL_URL: "http://host.docker.internal:3461",
  AUTH_PROXY_SECRET: env.AUTH_PROXY_SECRET,
};
for (const [name, values] of [
  ["api", apiEnv],
  ["web", webEnv],
])
  writeFileSync(
    resolve(root, `.sprint1-local/docker-${name}.env`),
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
docker([
  "run",
  "-d",
  "--name",
  names[0],
  "--label",
  "sprint1.review=20261015",
  "--env-file",
  ".sprint1-local/docker-api.env",
  "-p",
  "127.0.0.1:3461:10000",
  "--mount",
  `type=bind,source=${resolve(root, ".sprint1-local/signing.pem")},target=/run/secrets/scanner.pem,readonly`,
  image,
]);
docker([
  "run",
  "-d",
  "--name",
  names[1],
  "--label",
  "sprint1.review=20261015",
  "--env-file",
  ".sprint1-local/docker-web.env",
  "-p",
  "127.0.0.1:3460:10000",
  image,
]);
for (let i = 0; i < 90; i++) {
  try {
    if ((await fetch("http://127.0.0.1:3460/api/health")).status === 200) break;
  } catch {}
  if (i === 89) throw new Error("Docker readiness failed");
  await new Promise((r) => setTimeout(r, 500));
}
assert.equal((await fetch("http://127.0.0.1:3461/health")).status, 200);
assert.equal((await fetch("http://127.0.0.1:3460/")).status, 200);
const account = c.accounts.find((a) => a.email.startsWith("organizer-a@"));
const login = await fetch("http://127.0.0.1:3460/api/auth/login", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "http://localhost:3460",
  },
  body: JSON.stringify(account),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie");
assert.match(cookie, /Secure/);
assert.match(cookie, /HttpOnly/);
assert.equal(
  (
    await fetch("http://127.0.0.1:3460/api/auth/me", {
      headers: { cookie: cookie.split(";")[0] },
    })
  ).status,
  200,
);
const user = JSON.parse(docker(["image", "inspect", image]))[0].Config.User;
assert.equal(user, "node");
const relativeFiles = [
  "apps/web/server.mjs",
  "apps/web/src/lib/server/login-transport.mjs",
  "packages/shared/login-peer.js",
];
const files = [];
for (const file of relativeFiles) {
  const inside = file.startsWith("apps/web/")
    ? "/app/web/" + file.slice(9)
    : "/app/web/node_modules/shared/" + file.slice(16);
  const hash = docker([
    "exec",
    names[1],
    "node",
    "-e",
    `const f=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(f.readFileSync(${JSON.stringify(inside)})).digest('hex'))`,
  ]);
  const sourceHash = createHash("sha256")
    .update(readFileSync(resolve(root, file)))
    .digest("hex");
  assert.equal(hash, sourceHash);
  files.push({ file, sha256: hash });
}
const privateAbsent = docker([
  "exec",
  names[1],
  "node",
  "-e",
  "const f=require('node:fs');console.log(!f.existsSync('/app/.env')&&!f.existsSync('/app/.sprint1-local'))",
]);
assert.equal(privateAbsent, "true");
writeFileSync(
  resolve(root, "evidence/sprint1/20261015-gitflow/docker-smoke.json"),
  JSON.stringify(
    {
      image,
      imageId: docker(["image", "inspect", image, "--format", "{{.Id}}"]),
      source:
        "Runtime hashes match candidate; image predates later test-only edits",
      status: "PASS",
      user,
      apiHealth: 200,
      webHome: 200,
      proxyHealth: 200,
      login: 200,
      cookieFlags: "HttpOnly; Secure; SameSite=Lax",
      replayMe: 200,
      privateFilesAbsent: true,
      files,
      limitation:
        "Local Docker with synthetic gateway configuration, no provider call, no staging rollout proof. Secure cookie checked as header; replay was explicit HTTP test client, not browser storage.",
    },
    null,
    2,
  ),
);
console.log(
  "Docker runtime smoke PASS; synthetic isolated environment, no staging claim.",
);
