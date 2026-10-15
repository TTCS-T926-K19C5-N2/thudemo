import https from "node:https";
import http from "node:http";
import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loginTransport } from "../apps/web/src/lib/server/login-transport.mjs";
export function stagingConfig(value) {
  if (
    value?.profile !== "sprint1-laptop-20261015" ||
    !/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^192\.168\.\d{1,3}\.\d{1,3}$|^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(
      value.lanAddress,
    ) ||
    value.lanAddress.split(".").some((n) => Number(n) > 255) ||
    value.gatewayPort !== 3470 ||
    value.pgPort !== 15455 ||
    value.redisPort !== 16405 ||
    value.database !== "sprint1_staging_20261015" ||
    value.user !== "sprint1_staging" ||
    typeof value.authProxySecret !== "string" ||
    value.authProxySecret.length < 32
  )
    throw new Error("Exact isolated LAN staging configuration required");
  return value;
}
export function stagingRelease(value) {
  if (
    !/^[a-f0-9]{40}$/.test(value?.sha) ||
    ![3473, 3474].includes(value.webPort) ||
    ![3471, 3472].includes(value.apiPort) ||
    value.apiPort !== value.webPort - 2
  )
    throw new Error("Invalid active staging release");
  return value;
}
const hopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];
export function stagingProxy(activeFile) {
  return (request, response) => {
    let active;
    try {
      active = stagingRelease(JSON.parse(readFileSync(activeFile, "utf8")));
    } catch {
      response
        .writeHead(503, { "cache-control": "no-store" })
        .end("Staging has no healthy active release");
      return;
    }
    const headers = { ...request.headers, host: `127.0.0.1:${active.webPort}` };
    for (const name of [
      ...hopHeaders,
      "forwarded",
      "x-forwarded-for",
      "x-forwarded-host",
      "x-forwarded-proto",
      "x-forwarded-port",
      "x-real-ip",
      "cf-connecting-ip",
    ])
      delete headers[name];
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: active.webPort,
        method: request.method,
        path: request.url,
        headers,
        timeout: 15000,
      },
      (incoming) => {
        const outgoing = { ...incoming.headers };
        for (const name of hopHeaders) delete outgoing[name];
        response.writeHead(incoming.statusCode ?? 502, outgoing);
        incoming.pipe(response);
        incoming.once("error", () => response.destroy());
      },
    );
    upstream.once("timeout", () => upstream.destroy());
    upstream.once("error", () => {
      if (!response.headersSent)
        response.writeHead(503, { "cache-control": "no-store" });
      response.end("Staging upstream unavailable");
    });
    request.once("aborted", () => upstream.destroy());
    request.pipe(upstream);
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir = resolve(import.meta.dirname, "../.sprint1-staging");
  const c = stagingConfig(
    JSON.parse(readFileSync(resolve(dir, "config.json"), "utf8")),
  );
  // The TLS listener owns the real LAN TCP peer. Backends bind loopback only;
  // they receive this HMAC, never an identity from X-Forwarded-For.
  const server = https.createServer(
    {
      key: readFileSync(resolve(dir, "tls/server-key.pem")),
      cert: readFileSync(resolve(dir, "tls/server-cert.pem")),
      minVersion: "TLSv1.2",
    },
    loginTransport(
      stagingProxy(resolve(dir, "active.json")),
      c.authProxySecret,
    ),
  );
  server.listen(c.gatewayPort, c.lanAddress, () =>
    console.log(`Staging HTTPS listening on ${c.lanAddress}:${c.gatewayPort}`),
  );
  server.on("error", () => {
    appendFileSync(
      resolve(dir, "gateway-errors.log"),
      new Date().toISOString() + " gateway error\n",
    );
    process.exitCode = 1;
  });
}
