import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const LOGIN_PEER_HEADER = "x-event-login-peer";
// Express login matching is case insensitive and accepts a trailing slash.
// Classify every equivalent proxy path before deciding whether identity is required.
export function isLoginProxyPath(path) {
  return (
    decodeURIComponent(path).replace(/\/+$/, "").toLowerCase() ===
    "/api/auth/login"
  );
}
export function canonicalPeer(ip) {
  const value = ip?.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (typeof value !== "string" || value.length > 45 || !isIP(value))
    throw new Error("Invalid transport peer");
  return value.toLowerCase();
}
function key(secret) {
  if (
    typeof secret !== "string" ||
    secret.length < 32 ||
    secret.startsWith("<")
  )
    throw new Error("AUTH_PROXY_SECRET must contain at least 32 characters");
  return secret;
}
function mac(value, secret) {
  return createHmac("sha256", key(secret))
    .update(`POST\n/auth/login\n${value}`)
    .digest();
}
export function signLoginPeer(ip, secret, now = Date.now()) {
  const value = `${Math.floor(now / 1000)}|${canonicalPeer(ip)}`;
  return `${Buffer.from(value).toString("base64url")}.${mac(value, secret).toString("base64url")}`;
}
export function verifyLoginPeer(header, secret, now = Date.now()) {
  if (
    typeof header !== "string" ||
    header.length > 200 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(header)
  )
    throw new Error("Invalid peer attestation");
  const [encoded, signature] = header.split(".");
  const value = Buffer.from(encoded, "base64url").toString("utf8");
  if (Buffer.from(value).toString("base64url") !== encoded)
    throw new Error("Invalid peer encoding");
  const [timestamp, ip, extra] = value.split("|");
  if (
    extra !== undefined ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 30 ||
    canonicalPeer(ip) !== ip
  )
    throw new Error("Expired or invalid peer attestation");
  if (!timingSafeEqual(mac(value, secret), Buffer.from(signature, "base64url")))
    throw new Error("Invalid peer signature");
  return ip;
}
