// Isolated load generator only. Credentials stay in private parent/child IPC;
// no server guard, quota, timer or data path is changed by client concurrency.
import https from "node:https";
let agent, origin;
async function one({ path, cookie, seatId }) {
  const start = performance.now(),
    startedUnixMs = performance.timeOrigin + start,
    timings = {};
  return new Promise((done) => {
    const finish = (status, error) =>
      done({
        status,
        ms: performance.now() - start,
        startedUnixMs,
        timings,
        ...(error ? { error } : {}),
      });
    const request = https.request(
      origin + path,
      {
        agent,
        method: "POST",
        timeout: 30000,
        headers: { origin, cookie, "content-type": "application/json" },
      },
      (response) => {
        timings.ttfbMs = performance.now() - start;
        response.resume();
        response.once("end", () => finish(response.statusCode));
        response.once("error", (e) => finish(0, e.code ?? e.name));
      },
    );
    request.once("socket", (socket) => {
      timings.socketAssignedMs = performance.now() - start;
      timings.reusedSocket = !socket.connecting;
      if (socket.connecting) {
        socket.once(
          "connect",
          () => (timings.connectMs = performance.now() - start),
        );
        socket.once(
          "secureConnect",
          () => (timings.tlsMs = performance.now() - start),
        );
      }
    });
    request.once("error", (e) => finish(0, e.code ?? e.name));
    request.once("timeout", () => request.destroy(Error("TLS deadline")));
    request.end(JSON.stringify({ seatIds: [seatId] }));
  });
}
process.once("disconnect", () => {
  agent?.destroy();
  process.exit(0);
});
process.on("message", async (job) => {
  if (job?.type === "configure") {
    const url = new URL(job.origin);
    if (
      url.protocol !== "https:" ||
      url.port !== "3470" ||
      !/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)
    )
      process.exit(1);
    origin = url.origin;
    agent = new https.Agent({
      keepAlive: true,
      maxSockets: 50,
      ca: job.ca,
      rejectUnauthorized: true,
    });
    process.send({ type: "ready" });
  } else if (job?.type === "round" && agent && job.requests?.length === 50) {
    const responses = await Promise.all(job.requests.map(one));
    process.send({ type: "result", responses });
  }
});
