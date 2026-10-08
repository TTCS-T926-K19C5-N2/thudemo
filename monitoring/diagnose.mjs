import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  runtime = resolve(import.meta.dirname, ".runtime");
const args = [
  "compose",
  "--env-file",
  resolve(runtime, "compose.env"),
  "-f",
  resolve(import.meta.dirname, "compose.yaml"),
];
const sensitive = [
  "db-password",
  "metrics-token",
  "grafana-password",
  "smtp-password",
  "telegram-token",
  "external-smtp-password",
  "external-telegram-token",
]
  .filter((n) => existsSync(resolve(runtime, n)))
  .map((n) => readFileSync(resolve(runtime, n), "utf8").trim())
  .filter(Boolean);
const command = (tail) =>
  spawnSync("docker", [...args, ...tail], {
    cwd: root,
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
const states = command(["ps", "--all", "--format", "json"]);
const logs = command([
  "logs",
  "--no-color",
  "--tail",
  "50",
  "grafana",
  "prometheus",
  "alertmanager",
]);
let text = [states.stdout, logs.stdout, logs.stderr].filter(Boolean).join("\n");
for (const value of sensitive) text = text.split(value).join("[REDACTED]");
text = text
  .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]")
  .replace(/postgresql:\/\/[^\s]+/g, "postgresql://[REDACTED]");
const dir = resolve(root, "evidence/s43/runtime");
mkdirSync(dir, { recursive: true });
writeFileSync(
  resolve(dir, "startup-diagnostics.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      localOnly: true,
      states: text,
      commandExit: states.status,
      logsExit: logs.status,
    },
    null,
    2,
  ),
);
console.log(text);
