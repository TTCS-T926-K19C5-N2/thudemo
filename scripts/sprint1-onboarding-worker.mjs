import { readFileSync, createWriteStream } from "node:fs";
import { Console } from "node:console";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(
  readFileSync(resolve(root, ".sprint1-demo/config.json")),
);
if (config.root !== root)
  throw Error("Demo profile belongs to another checkout");
for (const key of Object.keys(process.env)) {
  if (
    /^(DATABASE_|REDIS_|SMTP_|REGISTRATION_|SCANNER_|TICKET_SIGNING_|AUTH_|PAYMENT_|MOMO_|WEB_|API_|APP_ENV$|NODE_ENV$|PORT$)/.test(
      key,
    )
  )
    delete process.env[key];
}
Object.assign(
  process.env,
  parseEnv(readFileSync(resolve(root, ".env"), "utf8")),
);
if (process.env.SPRINT1_DEMO_PROFILE !== config.profile)
  throw Error("Refuse foreign .env");
const mode = process.argv[2];
if (!["api", "web"].includes(mode)) throw Error("Expected api or web");
const output = createWriteStream(
  resolve(root, ".sprint1-demo", mode + ".log"),
  { flags: "a" },
);
globalThis.console = new Console({ stdout: output, stderr: output });
process.env.NODE_ENV = mode === "web" ? "production" : "development";
process.chdir(resolve(root, `apps/${mode}`));
await import(
  pathToFileURL(
    resolve(
      root,
      mode === "api" ? "apps/api/dist/main.js" : "apps/web/server.mjs",
    ),
  ).href
);
