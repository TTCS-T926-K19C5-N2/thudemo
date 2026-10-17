import { createSecureServer } from "node:http2";
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
    value.apiPort !== value.webPort - 2 ||
    (value.apiReplicaPort !== undefined &&
      value.apiReplicaPort !== value.apiPort + 4)
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
// Bound backend socket creation while keeping all incoming requests in flight.
// Reuse sockets across requests/releases; each target port has its own pool.
const upstreamAgent = new http.Agent({
  keepAlive: true,
  // One backend socket per available DB pool slot, per API target.
  maxSockets: 10,
  maxFreeSockets: 10,
});
export function stagingForwardHeaders(input, port) {
  const headers = { ...input, host: `127.0.0.1:${port}` };
  for (const name of Object.keys(headers)) {
    if (
      name.startsWith(":") ||
      hopHeaders.includes(name.toLowerCase()) ||
      [
        "forwarded",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-proto",
        "x-forwarded-port",
        "x-real-ip",
        "cf-connecting-ip",
      ].includes(name.toLowerCase())
    )
      delete headers[name];
  }
  return headers;
}
export function holdProxyTarget(request, active, sequence = 0) {
  // Only the existing canonical claim route takes the short network path.
  // Login and all other routes keep the Next proxy and its attestation verifier.
  if (
    active.directHoldProxy !== true ||
    request.method !== "POST" ||
    !/^\/api\/showtimes\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/holds(?:\?.*)?$/.test(
      request.url ?? "",
    )
  )
    return null;
  return {
    port:
      active.apiReplicaPort && sequence % 2
        ? active.apiReplicaPort
        : active.apiPort,
    path: request.url.slice(4),
  };
}
async function holdBody(request) {
  const chunks = [];
  let bytes = 0,
    oversized = false;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 5 * 1024 * 1024) {
      oversized = true;
      chunks.length = 0;
    }
    if (!oversized) chunks.push(chunk);
  }
  if (oversized) throw new RangeError("Body exceeds5MB");
  return Buffer.concat(chunks);
}
export function stagingProxy(activeFile) {
  let directSequence = 0;
  return async (request, response) => {
    let active;
    try {
      active = stagingRelease(JSON.parse(readFileSync(activeFile, "utf8")));
    } catch {
      response
        .writeHead(503, { "cache-control": "no-store" })
        .end("Staging has no healthy active release");
      return;
    }
    const direct = holdProxyTarget(request, active, directSequence);
    if (direct) directSequence++;
    let body;
    if (direct) {
      try {
        body = await holdBody(request);
      } catch (error) {
        response
          .writeHead(error instanceof RangeError ? 413 : 400, {
            "cache-control": "no-store",
            "content-type": "application/json",
          })
          .end(
            JSON.stringify({
              message:
                error instanceof RangeError
                  ? "Tệp vượt quá 5 MB."
                  : "Invalid request",
            }),
          );
        return;
      }
    }
    const headers = stagingForwardHeaders(
      request.headers,
      direct?.port ?? active.webPort,
    );
    if (direct) {
      for (const name of Object.keys(headers))
        if (
          ![
            "host",
            "accept",
            "content-type",
            "cookie",
            "origin",
            "sec-fetch-site",
          ].includes(name)
        )
          delete headers[name];
      headers["content-length"] = String(body.length);
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: direct?.port ?? active.webPort,
        agent: upstreamAgent,
        method: request.method,
        path: direct?.path ?? request.url,
        headers,
        timeout: 15000,
      },
      (incoming) => {
        const outgoing = direct
          ? { "cache-control": "no-store" }
          : { ...incoming.headers };
        if (direct)
          for (const name of ["content-type", "retry-after", "set-cookie"])
            if (incoming.headers[name] !== undefined)
              outgoing[name] = incoming.headers[name];
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
    if (direct) upstream.end(body);
    else request.pipe(upstream);
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
  const server = createSecureServer(
    {
      key: readFileSync(resolve(dir, "tls/server-key.pem")),
      cert: readFileSync(resolve(dir, "tls/server-cert.pem")),
      minVersion: "TLSv1.2",
      allowHTTP1: true,
      settings: { maxConcurrentStreams: 256 },
    },
    loginTransport(
      stagingProxy(resolve(dir, "active.json")),
      c.authProxySecret,
    ),
  );
  // Client disconnect/protocol errors must not terminate the shared listener.
  server.on("sessionError", () => {});
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
