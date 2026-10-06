// Local integration receiver only. No external proxy, forwarding or real tokens.
import { createServer } from "node:http";
import { createServer as tcpServer } from "node:net";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
const credential = readFileSync("/run/secrets/metrics_token", "utf8").trim();
const path = "/evidence/deliveries.jsonl";
const events = existsSync(path)
  ? readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s))
  : [];
let emailFail = false,
  telegramFail = false;
const testNames = ["S43IntegrationBoth", "S43IntegrationEmailFailure", "S43IntegrationTelegramFailure"];
let currentTest = null;
const record = (channel, state, payload) => {
  const event = {
    id: events.length + 1,
    channel,
    state,
    at: new Date().toISOString(),
    digest: createHash("sha256").update(payload).digest("hex"),
    test: true,
    alertName: state === "failed" ? currentTest : testNames.find((name) => payload.includes(name)) ?? null,
  };
  events.push(event);
  appendFileSync(path, JSON.stringify(event) + "\n");
  return event.id;
};
const smtp = tcpServer((socket) => {
  socket.setTimeout(10000, () => socket.destroy());
  socket.write("220 s43-local ESMTP\r\n");
  let buffer = "",
    data = false,
    body = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    if (buffer.length + body.length > 65536) {
      socket.destroy();
      return;
    }
    while (buffer.includes("\r\n")) {
      const end = buffer.indexOf("\r\n"),
        line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (data) {
        if (line === ".") {
          data = false;
          const state = /\bresolved\b/i.test(body) ? "resolved" : "firing";
          const id = record("email", state, body);
          socket.write(`250 2.0.0 accepted local-${id}\r\n`);
          body = "";
        } else body += line + "\n";
      } else if (/^EHLO|^HELO/i.test(line))
        socket.write("250-s43-local\r\n250 8BITMIME\r\n");
      else if (/^MAIL FROM/i.test(line)) {
        if (emailFail) {
          record("email", "failed", "transient SMTP 451");
          socket.write("451 4.3.0 test unavailable\r\n");
        } else socket.write("250 OK\r\n");
      } else if (/^RCPT TO/i.test(line)) socket.write("250 OK\r\n");
      else if (/^DATA/i.test(line)) {
        data = true;
        socket.write("354 End with dot\r\n");
      } else if (/^QUIT/i.test(line)) socket.end("221 Bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
smtp.listen(2525, "0.0.0.0");
const http = createServer((req, res) => {
  const json = (code, value) =>
    res
      .writeHead(code, { "Content-Type": "application/json" })
      .end(JSON.stringify(value));
  if (req.url === "/health") return json(200, { local: true });
  if (req.url === "/control" || req.url === "/deliveries") {
    const a = Buffer.from(req.headers.authorization ?? ""),
      b = Buffer.from(`Bearer ${credential}`);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return json(401, {});
    if (req.url === "/deliveries") return json(200, events);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(body);
        if (Object.hasOwn(v, "testName")) {
          if (v.testName !== null && !testNames.includes(v.testName)) return json(400, {});
          currentTest = v.testName;
        }
        emailFail = v.emailFail === true;
        telegramFail = v.telegramFail === true;
        json(200, { emailFail, telegramFail });
      } catch {
        json(400, {});
      }
    });
    return;
  }
  if (
    req.method !== "POST" ||
    req.url !== "/bot1000:local_fixture_only/sendMessage"
  )
    return json(404, {});
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 65536) req.destroy();
  });
  req.on("end", () => {
    try {
      const v = req.headers["content-type"]?.includes("application/json")
        ? JSON.parse(body)
        : Object.fromEntries(new URLSearchParams(body));
      if (
        String(v.chat_id) !== "1000" ||
        !String(v.text).includes("KIỂM THỬ S-43")
      )
        return json(400, { ok: false });
      if (telegramFail) {
        record("telegram", "failed", "transient API 503");
        return json(503, {
          ok: false,
          error_code: 503,
          description: "local test unavailable",
        });
      }
      const text = String(v.text),
        state = /resolved/.test(text) ? "resolved" : "firing",
        id = record("telegram", state, text);
      json(200, {
        ok: true,
        result: {
          message_id: id,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1000, type: "private" },
          text,
        },
      });
    } catch {
      json(400, { ok: false });
    }
  });
});
http.listen(8080, "0.0.0.0");
