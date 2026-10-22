import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QR_PLAYWRIGHT_MODULE ?? "playwright");
const fixture = JSON.parse(
  readFileSync(process.env.QR_PRIVATE_FIXTURE_FILE, "utf8"),
);
const root = resolve(import.meta.dirname, "../../.."),
  out = resolve(root, "evidence/s30");
mkdirSync(out, { recursive: true });
const base = "http://127.0.0.1:3050",
  report = {
    sourceSha: process.env.QR_SOURCE_SHA ?? "working-tree",
    driverSha256: createHash("sha256")
      .update(readFileSync(import.meta.filename))
      .digest("hex"),
    environment:
      "Real web3050 -> API3051 -> private PG15440; independent staff and owner sessions",
    camera: false,
    staging: false,
    checks: [],
    screenshots: [],
    consoleErrors: [],
    checkInResponses: [],
    startedAt: new Date().toISOString(),
  };
const browser = await chromium.launch({ headless: true }),
  contexts = [];
const check = (value, label) => {
  assert(value, label);
  report.checks.push(label);
};
async function session(actor, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  await context.addCookies([
    {
      name: "event_session",
      value: actor.cookie.split("=")[1],
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname.startsWith("/api/showtimes/") &&
      url.pathname.endsWith("/check-in")
    )
      report.checkInResponses.push({
        status: response.status(),
        path: url.pathname,
      });
  });
  page.on("pageerror", (error) => report.consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/Failed to load resource|net::ERR_FAILED/.test(message.text())
    )
      report.consoleErrors.push(message.text());
  });
  return page;
}
const status = (page) => page.getByTestId("ticket-scan-status");
async function scanner(page) {
  await page.goto(base + "/scanner?showtimeId=" + fixture.showtimeId);
  await page.getByRole("button", { name: "Tải cửa được phân công" }).click();
  await page.waitForFunction(
    () => !document.querySelector("button[type=submit]")?.disabled,
  );
}
async function scan(page, qr) {
  await page.getByLabel("Hoặc nhập mã vé").fill(qr);
  await page.getByRole("button", { name: "Kiểm tra vé" }).click();
}
async function shot(page, name) {
  await page.screenshot({
    path: resolve(out, name),
    fullPage: !name.startsWith("mobile"),
    animations: "disabled",
  });
  report.screenshots.push(name);
}
try {
  const a = await session(fixture.a),
    b = await session(fixture.b),
    mobile = await session(fixture.b, { width: 390, height: 844 }),
    owner = await session(fixture.buyer);
  await Promise.all([scanner(a), scanner(b), scanner(mobile)]);
  await scan(b, fixture.usedQr);
  await status(b).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  check(
    (await status(b).innerText()).includes("19:02:00") &&
      (await status(b).innerText()).includes("tại cửa A"),
    "Signed used ticket at B shows first 19:02 gate A",
  );
  await shot(b, "desktop-used.png");
  check(
    (await b.getByRole("button", { name: "Cho vào có ghi chú" }).count()) === 0,
    "S-30 does not expose S-31 exception action",
  );
  await scan(a, fixture.fresh.qr);
  await status(a).filter({ hasText: "Hợp lệ" }).waitFor();
  check(
    (await status(a).innerText()).includes("A-"),
    "Signed ticket verified by browser public key then real server commit returns seat",
  );
  await shot(a, "desktop-valid.png");
  await a.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  check(
    await a
      .getByLabel("Hoặc nhập mã vé")
      .evaluate((el) => el === document.activeElement),
    "Next scan clears and focuses input",
  );
  await scan(a, fixture.fresh.id);
  await status(a).filter({ hasText: "Không phải vé của hệ thống hoặc chữ ký không hợp lệ." }).waitFor();
  check(
    !(await status(a).innerText()).includes("Hợp lệ"),
    "Unsigned real UUID rejected without green state",
  );
  await shot(a, "desktop-invalid.png");
  await a.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  const bad = fixture.retry.qr.replace("ET1.", "ET2.");
  await scan(a, bad);
  await status(a).filter({ hasText: "Không phải vé của hệ thống hoặc chữ ký không hợp lệ." }).waitFor();
  check(
    !(await status(a).innerText()).includes("Hợp lệ"),
    "Unsupported QR version rejected by server with no admission",
  );
  await a.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  const pattern = "**/api/showtimes/*/check-in";
  await a.route(pattern, async (route) => {
    await new Promise((done) => setTimeout(done, 3500));
    await route.continue();
  });
  await scan(a, fixture.retry.qr);
  await status(a).filter({ hasText: "Đang chờ" }).waitFor();
  check(
    await a.getByRole("button", { name: "Kiểm tra vé" }).isDisabled(),
    "Over3s waits and prevents duplicate submit, no green before commit",
  );
  await status(a).filter({ hasText: "Hợp lệ" }).waitFor();
  await a.unroute(pattern);
  await a.getByLabel("Hoặc nhập mã vé").fill(fixture.usedQr);
  check(
    !(await status(a).innerText()).includes("Hợp lệ"),
    "Changing QR clears stale valid result",
  );
  await a.route(pattern, (route) => route.abort());
  await scan(a, fixture.usedQr);
  await status(a)
    .filter({ hasText: "Chưa nhận xác nhận từ máy chủ. Chưa cho vào; yêu cầu được giữ để kiểm tra lại khi có mạng." })
    .waitFor();
  check(
    !(await status(a).innerText()).includes("Hợp lệ"),
    "Network failure never produces valid/offline state",
  );
  await shot(a, "desktop-network-error.png");
  await a.unroute(pattern);
  await a.getByRole("button", { name: "Thử kết nối lại", exact: true }).click();
  await a.getByTestId("network-status").getByText("Trực tuyến", { exact: true }).waitFor();
  await a.getByTestId("offline-status-banner").waitFor({ state: "hidden" });
  check(true, "Restored server probe and validated sync ACK end the injected network outage before the next online admission");
  await scan(mobile, fixture.usedQr);
  await status(mobile).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  await shot(mobile, "mobile-used.png");
  check(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile390x844 fits without horizontal overflow",
  );
  check(
    await mobile
      .getByRole("button", { name: "Kiểm tra vé" })
      .evaluate((el) => el.getBoundingClientRect().height >= 44),
    "Touch target at least44px",
  );
  check(
    (await status(b).getAttribute("aria-live")) !== null,
    "Result has live region and text/icon beyond color",
  );
  await owner.goto(base + "/orders/" + fixture.ownerOrderId);
  await owner.getByTestId("signed-ticket").waitFor();
  check(
    (await owner.getByTestId("signed-ticket").locator("svg, img[data-testid=ticket-qr-image]").count()) === 1,
    "Owner page renders one real signed QR image at a time",
  );
  check(
    (await owner.getByTestId("countdown-banner").count()) === 0 &&
      (await owner.getByTestId("expired-notice").count()) === 0,
    "Paid order does not show pending-payment countdown/expiry",
  );
  await shot(owner, "desktop-owner-qr-fixture.png");
  const qrImage = await owner
    .getByTestId("signed-ticket")
    .locator("svg, img[data-testid=ticket-qr-image]")
    .screenshot();
  writeFileSync(resolve(out, "owner-qr-element.png"), qrImage);
  await owner.addScriptTag({
    path: resolve(
      root,
      "apps/web/node_modules/html5-qrcode/html5-qrcode.min.js",
    ),
  });
  const decoded = await owner.evaluate(
    async ({ imageBase64 }) => {
      const { Html5Qrcode } = window;
      const div = document.createElement("div");
      div.id = "fixture-image-decoder";
      div.hidden = true;
      document.body.append(div);
      const binary = atob(imageBase64),
        bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const attempts = [];
      try {
        for (const angle of [0, 90, 180, 270]) {
          let blob = new Blob([bytes], { type: "image/png" });
          if (angle) {
            const image = new Image();
            const url = URL.createObjectURL(blob);
            try {
              image.src = url;
              await image.decode();
              const canvas = document.createElement("canvas");
              canvas.width = image.width;
              canvas.height = image.height;
              const context = canvas.getContext("2d");
              context.translate(canvas.width / 2, canvas.height / 2);
              context.rotate(angle * Math.PI / 180);
              context.drawImage(image, -image.width / 2, -image.height / 2);
              blob = await new Promise((done) => canvas.toBlob(done));
            } finally { URL.revokeObjectURL(url); }
          }
          const qr = new Html5Qrcode(div.id);
          try {
            const payload = await qr.scanFile(new File([blob], "fixture.png", { type: "image/png" }), false);
            attempts.push({ angle, result: "PASS" });
            return { payload, attempts };
          } catch (error) {
            attempts.push({ angle, result: "FAIL", error: String(error) });
          } finally { qr.clear(); }
        }
        throw Error(JSON.stringify(attempts));
      } finally { div.remove(); }
    },
    { imageBase64: qrImage.toString("base64") },
  );
  report.imageDecodeAttempts = decoded.attempts;
  check(
    decoded.payload === fixture.camera.qr,
    "Actual QR image decodes to owner-issued signed payload; image fixture is not hardware-camera proof",
  );
  await a.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  await scan(a, decoded.payload);
  await status(a).filter({ hasText: "Hợp lệ" }).waitFor();
  check(
    (await status(a).innerText()).includes("A-"),
    "Decoded signed image accepted through the real scanner/API",
  );
  await b.goto(base + "/scanner/snapshot");
  await b
    .getByRole("button", { name: "Vào máy quét suất này" })
    .first()
    .waitFor();
  await b
    .getByRole("button", { name: "Vào máy quét suất này" })
    .first()
    .click();
  await b.getByRole("button", { name: "Tải danh sách", exact: true }).click();
  await b.getByText("Đã tải mới nhất", { exact: true }).waitFor();
  const localMeta = await b.evaluate(async (showtimeId) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("thudemo_scanner_db");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db
          .transaction("showtime_meta")
          .objectStore("showtime_meta")
          .get(showtimeId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, fixture.showtimeId);
  check(
    localMeta.verificationKeys.length === 2 && localMeta.ticketCount > 0,
    "S-33 full snapshot stores canonical tickets and both rotation public keys in real IndexedDB",
  );
  check(
    (await b.getByRole("heading").count()) > 0,
    "S-33 snapshot route still renders after online scanner route integration",
  );
  check(
    report.consoleErrors.length === 0,
    "No unexpected browser console/runtime errors",
  );
  check(
    await a.locator(`select[aria-label="Mã suất diễn"] option[value="${fixture.otherShowtimeId}"]`).count() === 0,
    "Unassigned other showtime cannot be selected in the operative scanner",
  );
  await a.getByLabel("Mã suất diễn").selectOption("");
  check(
    !(await status(a).innerText()).includes(
      "Vé hợp lệ. Check-in thành công.",
    ) && (await a.getByLabel("Hoặc nhập mã vé").inputValue()) === "",
    "Clearing showtime selection clears previous admission message and QR input",
  );
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.error = error.message;
  const pageStates = [];
  for (const context of contexts) {
    const page = context.pages()[0];
    if (!page) continue;
    try {
      pageStates.push({
        url: page.url(),
        state: await status(page).getAttribute("data-state"),
        text: await status(page).innerText(),
      });
    } catch (diagnosticError) {
      pageStates.push({
        url: page.url(),
        diagnosticError:
          diagnosticError instanceof Error
            ? diagnosticError.message
            : String(diagnosticError),
      });
    }
  }
  console.error(
    JSON.stringify(
      {
        error: error.message,
        pageStates,
        checkInResponses: report.checkInResponses,
        consoleErrors: report.consoleErrors,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    resolve(out, "browser-proof.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks.length,
    camera: false,
    screenshots: report.screenshots,
  }),
);
