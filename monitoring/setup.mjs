import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  chmodSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const dir = resolve(import.meta.dirname, ".runtime");
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
const secret = (name, value = randomBytes(32).toString("hex")) => {
  const path = resolve(dir, name);
  if (!existsSync(path)) writeFileSync(path, value, { mode: 0o600 });
  return readFileSync(path, "utf8").trim();
};
const password = secret("db-password");
secret("metrics-token");
secret("grafana-password");
secret("smtp-password", "local-unused");
secret("telegram-token", "1000:local_fixture_only");
secret("external-smtp-password", "external-not-configured");
secret("external-telegram-token", "external-not-configured");
writeFileSync(resolve(dir, "compose.env"), `S43_DB_PASSWORD=${password}\n`, {
  mode: 0o600,
});
export const targets = [
  {
    targets: ["api-a:9464", "api-b:9464"],
    labels: { service: "api", environment: "local" },
  },
  {
    targets: ["worker:9464"],
    labels: { service: "worker", environment: "local" },
  },
];
writeFileSync(resolve(dir, "targets.json"), JSON.stringify(targets));
// Test rules are empty by default. Integration enables its own separate rule file.
if (!existsSync(resolve(dir, "test-rules.json")))
  writeFileSync(resolve(dir, "test-rules.json"), '{"groups":[]}');
const message =
  "KIỂM THỬ S-43 {{ .Status }} environment={{ .CommonLabels.environment }} service={{ .CommonLabels.service }} severity={{ .CommonLabels.severity }} {{ range .Alerts }}{{ .Labels.alertname }} metric={{ .Annotations.metric }} value={{ .Annotations.value }} threshold={{ .Annotations.threshold }} window={{ .Annotations.window }} since={{ .StartsAt }} dashboard={{ .Annotations.dashboard }} runbook={{ .Annotations.runbook }} {{ end }}";
const config = {
  global: { resolve_timeout: "30s" },
  route: {
    receiver: "discard",
    group_by: ["alertname", "environment", "service"],
    group_wait: "5s",
    group_interval: "10s",
    repeat_interval: "4h",
    routes: [{ receiver: "email", continue: true }, { receiver: "telegram" }],
  },
  receivers: [
    { name: "discard" },
    {
      name: "email",
      email_configs: [
        {
          to: "operator@example.invalid",
          from: "s43@example.invalid",
          smarthost: "receiver:2525",
          require_tls: false,
          send_resolved: true,
          headers: {
            Subject:
              "KIỂM THỬ S-43 {{ .Status }} {{ .CommonLabels.alertname }}",
          },
          text: message,
          html: "",
        },
      ],
    },
    {
      name: "telegram",
      telegram_configs: [
        {
          api_url: "http://receiver:8080",
          bot_token_file: "/run/secrets/telegram_token",
          chat_id: 1000,
          parse_mode: "",
          send_resolved: true,
          message,
        },
      ],
    },
  ],
};
// External mode is explicit. CI cannot send real notifications. Secrets never enter tracked config.
if (process.argv.includes("--external")) {
  assert(!process.env.CI, "External delivery is forbidden in CI");
  assert(
    process.env.S43_EXTERNAL_TEST_APPROVED === "true",
    "Explicit controlled test mode required",
  );
  const required = [
    "S43_SMTP_HOST",
    "S43_SMTP_PORT",
    "S43_SMTP_FROM",
    "S43_SMTP_USER",
    "S43_SMTP_PASSWORD",
    "S43_EMAIL_TO",
    "S43_TELEGRAM_BOT_TOKEN",
    "S43_TELEGRAM_CHAT_ID",
  ];
  assert(
    required.every((k) => process.env[k]),
    "Missing sender/bot configuration; do not print secrets",
  );
  // Check bot-owned private chat before sending, without reading getUpdates or private messages.
  const token = process.env.S43_TELEGRAM_BOT_TOKEN;
  const chat = process.env.S43_TELEGRAM_CHAT_ID;
  const decision = JSON.parse(
    readFileSync(resolve(dir, "approved-recipients.json"), "utf8"),
  );
  assert(
    process.env.S43_EMAIL_TO === decision.email &&
      chat === String(decision.telegramChatId),
    "Recipients must match the private PO decision",
  );
  let lookup;
  try {
    lookup = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.json());
  } catch {
    throw Error("Telegram chat verification unavailable; no notification sent");
  }
  assert(
    lookup.ok &&
      String(lookup.result.id) === chat &&
      lookup.result.type === "private",
    "Start the bot with /start and verify the approved private chat",
  );
  writeFileSync(resolve(dir, "external-telegram-token"), token, {
    mode: 0o600,
  });
  writeFileSync(
    resolve(dir, "external-smtp-password"),
    process.env.S43_SMTP_PASSWORD,
    {
      mode: 0o600,
    },
  );
  Object.assign(config.receivers[1].email_configs[0], {
    to: process.env.S43_EMAIL_TO,
    from: process.env.S43_SMTP_FROM,
    smarthost: `${process.env.S43_SMTP_HOST}:${process.env.S43_SMTP_PORT}`,
    auth_username: process.env.S43_SMTP_USER,
    auth_password_file: "/run/secrets/external_smtp_password",
    require_tls: true,
  });
  Object.assign(config.receivers[2].telegram_configs[0], {
    api_url: "https://api.telegram.org",
    chat_id: Number(chat),
    bot_token_file: "/run/secrets/external_telegram_token",
  });
}
writeFileSync(
  resolve(dir, "alertmanager.json"),
  JSON.stringify(config, null, 2),
  { mode: 0o600 },
);
// Compose file-backed secrets are bind mounts: container UIDs differ from host UID.
// Search/read is denied to other host users by the 0700 parent; mount files must
// be readable by non-root node, Grafana, Prometheus and Alertmanager inside containers.
for (const name of [
  "metrics-token",
  "grafana-password",
  "smtp-password",
  "telegram-token",
  "external-smtp-password",
  "external-telegram-token",
])
  chmodSync(resolve(dir, name), 0o444);
console.log(
  process.argv.includes("--external")
    ? "External config prepared; recipient masked, not delivery evidence"
    : "Local receiver config prepared; no external delivery",
);
