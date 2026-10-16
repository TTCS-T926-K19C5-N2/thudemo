import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";

/** Read only the authorized staging SMTP keys; never spread an arbitrary .env
 * into API runtime settings. A persistent separate key protects queued mail. */
export function registrationMailEnv(directory, origin) {
  const file = resolve(directory, "registration-mail.env");
  if (!existsSync(file)) return { REGISTRATION_MAIL_MODE: "off" };
  const input = parseEnv(readFileSync(file, "utf8"));
  if (!input.REGISTRATION_MAIL_MODE || input.REGISTRATION_MAIL_MODE === "off")
    return { REGISTRATION_MAIL_MODE: "off" };
  const keys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
  ];
  if (
    input.REGISTRATION_MAIL_MODE !== "smtp" ||
    keys.some((key) => !input[key] || /[\r\n]/.test(input[key]))
  )
    throw Error(
      "Staging registration SMTP configuration is incomplete; private values withheld",
    );
  const recipients = (input.REGISTRATION_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  if (
    recipients.some((value) => !email.test(value)) ||
    !email.test(input.SMTP_FROM) ||
    !["true", "false"].includes(input.SMTP_SECURE) ||
    !/^\d+$/.test(input.SMTP_PORT) ||
    Number(input.SMTP_PORT) < 1 ||
    Number(input.SMTP_PORT) > 65535
  )
    throw Error("Invalid staging SMTP settings; private values withheld");
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin)
    throw Error("Staging registration requires the fixed HTTPS origin");
  const keyFile = resolve(directory, "registration-mail.key");
  if (!existsSync(keyFile))
    writeFileSync(keyFile, randomBytes(32).toString("base64url"), {
      flag: "wx",
      mode: 0o600,
    });
  const key = readFileSync(keyFile, "utf8").trim();
  if (
    Buffer.from(key, "base64url").length !== 32 ||
    Buffer.from(key, "base64url").toString("base64url") !== key
  )
    throw Error("Invalid existing mail key; refused to regenerate it");
  return {
    ...Object.fromEntries(keys.map((key) => [key, input[key]])),
    REGISTRATION_ALLOWED_EMAILS: recipients.join(","),
    REGISTRATION_MAIL_MODE: "smtp",
    REGISTRATION_PUBLIC_ORIGIN: origin,
    REGISTRATION_MAIL_KEY: key,
  };
}
