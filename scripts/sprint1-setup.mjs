import { randomBytes, generateKeyPairSync } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, ".sprint1-local");
mkdirSync(dir, { recursive: true });
const file = resolve(dir, "config.json");
if (!existsSync(file)) {
  if (existsSync(resolve(root, ".env")))
    throw new Error("Existing .env: refuse to overwrite");
  const secret = () => randomBytes(24).toString("base64url");
  const config = {
    database: "sprint1_gitflow_20261015",
    user: "sprint1_local",
    dbPassword: secret(),
    webPort: 3440,
    apiPort: 3441,
    pgPort: 15445,
    redisPort: 16395,
    accounts: [
      "admin",
      "organizer-a",
      "organizer-b",
      "buyer",
      "lock-test",
      "multi-role",
    ].map((name) => ({
      email: `${name}@sprint1.demo.invalid`,
      password: secret(),
      roles:
        name === "admin"
          ? ["ADMIN"]
          : name.startsWith("organizer")
            ? ["ORGANIZER"]
            : name === "multi-role"
              ? ["BUYER", "ORGANIZER"]
              : ["BUYER"],
    })),
  };
  writeFileSync(file, JSON.stringify(config, null, 2));
  const keys = generateKeyPairSync("ed25519");
  writeFileSync(
    resolve(dir, "signing.pem"),
    keys.privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  const publicKeys = JSON.stringify({
    "sprint1-local": keys.publicKey.export({ type: "spki", format: "pem" }),
  });
  writeFileSync(
    resolve(root, ".env"),
    [
      `DATABASE_URL=postgresql://${config.user}:${config.dbPassword}@127.0.0.1:${config.pgPort}/${config.database}?schema=public`,
      `REDIS_HOST=127.0.0.1`,
      `REDIS_PORT=${config.redisPort}`,
      `PORT=${config.apiPort}`,
      `WEB_PORT=${config.webPort}`,
      `WEB_ORIGIN=http://localhost:${config.webPort}`,
      `API_INTERNAL_URL=http://127.0.0.1:${config.apiPort}`,
      "PAYMENT_GATEWAY=mock",
      `PAYMENT_WEBHOOK_SECRET=${secret()}`,
      `AUTH_PROXY_SECRET=${secret()}`,
      "HOLD_EXPIRY_MODE=off",
      "ORDER_EXPIRY_MODE=off",
      "SCANNER_KEY_ID=sprint1-local",
      `SCANNER_SIGNING_PRIVATE_KEY_FILE=${resolve(dir, "signing.pem").replaceAll("\\", "/")}`,
      `SCANNER_PUBLIC_KEYS='${publicKeys}'`,
    ].join("\n") + "\n",
  );
}
const c = JSON.parse(readFileSync(file));
if (c.database !== "sprint1_gitflow_20261015")
  throw new Error("Unexpected database");
const localEnv = parseEnv(readFileSync(resolve(root, ".env"), "utf8"));
let target;
try {
  target = new URL(localEnv.DATABASE_URL ?? "");
} catch {
  throw new Error("Invalid local DATABASE_URL configuration");
}
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== String(c.pgPort) ||
  target.pathname !== "/sprint1_gitflow_20261015" ||
  decodeURIComponent(target.username) !== c.user ||
  decodeURIComponent(target.password) !== c.dbPassword ||
  localEnv.REDIS_URL ||
  localEnv.REDIS_HOST !== "127.0.0.1" ||
  localEnv.REDIS_PORT !== String(c.redisPort) ||
  !localEnv.AUTH_PROXY_SECRET ||
  localEnv.AUTH_PROXY_SECRET.length < 32
) {
  throw new Error(
    "Refuse mismatched local database/cache/proxy configuration; existing files retained",
  );
}
writeFileSync(
  resolve(dir, "compose.json"),
  JSON.stringify(
    {
      services: {
        postgres: {
          image: "postgres:15-alpine",
          container_name: "sprint1-gitflow-pg-20261015",
          ports: [`127.0.0.1:${c.pgPort}:5432`],
          environment: {
            POSTGRES_USER: c.user,
            POSTGRES_PASSWORD: c.dbPassword,
            POSTGRES_DB: c.database,
          },
          volumes: ["sprint1-gitflow-data:/var/lib/postgresql/data"],
          labels: { "sprint1.review": "20261015" },
          healthcheck: {
            test: ["CMD-SHELL", `pg_isready -U ${c.user} -d ${c.database}`],
            interval: "2s",
            timeout: "3s",
            retries: 30,
          },
        },
        redis: {
          image: "redis:7-alpine",
          container_name: "sprint1-gitflow-redis-20261015",
          ports: [`127.0.0.1:${c.redisPort}:6379`],
          command: ["redis-server", "--appendonly", "yes"],
          volumes: ["sprint1-gitflow-cache:/data"],
          labels: { "sprint1.review": "20261015" },
          healthcheck: {
            test: ["CMD", "redis-cli", "ping"],
            interval: "2s",
            timeout: "3s",
            retries: 30,
          },
        },
      },
      volumes: { "sprint1-gitflow-data": {}, "sprint1-gitflow-cache": {} },
    },
    null,
    2,
  ),
);
console.log(
  "Local configuration ready; credentials: .sprint1-local/config.json",
);
