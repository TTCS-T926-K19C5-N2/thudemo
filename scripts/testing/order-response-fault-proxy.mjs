// Local-only browser test helper. Never use in deployment.
// node scripts/testing/order-response-fault-proxy.mjs <fixture-showtime-uuid>
import http from "node:http";
import net from "node:net";

const showtimeId = process.argv[2];
if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(showtimeId ?? ""))
  throw new Error("Pass the exact UUID of a dedicated local test fixture");
const target = `/api/showtimes/${showtimeId}/orders`;
const attempts = [];
const apiRequests = [];
const upgradedSockets = new Set();
let pendingResponse;
let watchdog;
let injected = false;

function interrupt() {
  if (!pendingResponse) return false;
  const response = pendingResponse;
  pendingResponse = undefined;
  clearTimeout(watchdog);
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Content-Length": "1000",
    "Cache-Control": "no-store",
  });
  response.flushHeaders();
  response.write('{"interrupted":');
  setTimeout(() => response.destroy(), 100);
  console.log(JSON.stringify({ event: "response_interrupted", showtimeId }));
  return true;
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/__test/")) {
    // Controls are terminal-only, never callable by a browser page.
    if (req.headers.origin || req.headers["sec-fetch-site"]) {
      res.writeHead(403).end();
      return;
    }
    const result =
      req.method === "POST" && req.url === "/__test/drop"
        ? { interrupted: interrupt() }
        : req.method === "GET" && req.url === "/__test/status"
          ? { showtimeId, waiting: !!pendingResponse, injected, attempts, apiRequests }
          : undefined;
    if (!result) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }
  const isOrder = req.method === "POST" && req.url === target;
  const shouldInterrupt = isOrder && !injected;
  if (shouldInterrupt) injected = true;
  const headers = { ...req.headers, host: "localhost:3000" };
  // Preserve the real application's origin check while testing through port 3002.
  if (headers.origin === "http://localhost:3002")
    headers.origin = "http://localhost:3000";
  const upstream = http.request(
    { hostname: "localhost", port: 3000, path: req.url, method: req.method, headers },
    (response) => {
      if (req.url?.startsWith("/api/")) {
        apiRequests.push({ method: req.method, path: req.url.split("?")[0], status: response.statusCode });
        if (apiRequests.length > 30) apiRequests.shift();
      }
      if (!isOrder) {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        let value;
        try { value = JSON.parse(body.toString("utf8")); } catch { /* not JSON */ }
        const record = {
          attempt: attempts.length + 1,
          status: response.statusCode,
          created: value?.created,
          orderId: value?.order?.id,
          paymentExpiresAt: value?.order?.paymentExpiresAt,
          serverTime: value?.serverTime,
          totalAmount: value?.order?.totalAmount,
          itemCount: value?.order?.items?.length,
        };
        attempts.push(record);
        console.log(JSON.stringify({ event: "upstream_order_response", ...record }));
        if (shouldInterrupt && response.statusCode === 200 && value?.created === true) {
          pendingResponse = res;
          // Enough time to inspect the disabled/loading state before terminal release.
          watchdog = setTimeout(interrupt, 60000);
        } else {
          res.writeHead(response.statusCode ?? 502, {
            "Content-Type": "application/json",
            "Content-Length": body.length,
            "Cache-Control": "no-store",
          });
          res.end(body);
        }
      });
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end('{"message":"Local test upstream unavailable"}');
  });
  req.pipe(upstream);
});

// Next.js development hydration/HMR needs the upgrade channel as well as HTTP.
server.on("upgrade", (req, socket, head) => {
  upgradedSockets.add(socket);
  socket.on("close", () => upgradedSockets.delete(socket));
  const upstream = net.connect(3000, "localhost", () => {
    const headers = { ...req.headers, host: "localhost:3000" };
    if (headers.origin === "http://localhost:3002") headers.origin = "http://localhost:3000";
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(headers))
      if (value !== undefined) upstream.write(`${name}: ${value}\r\n`);
    upstream.write("\r\n");
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
});

server.listen(3002, "127.0.0.1", () =>
  console.log(JSON.stringify({ event: "test_proxy_ready", origin: "http://localhost:3002", showtimeId })),
);
function shutdown() {
  clearTimeout(watchdog);
  for (const socket of upgradedSockets) socket.destroy();
  server.close();
  server.closeAllConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
