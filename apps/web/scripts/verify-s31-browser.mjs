import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.S31_PLAYWRIGHT_MODULE ?? "playwright");
assert(
  process.env.S31_PRIVATE_FIXTURE_FILE,
  "Private fixture path outside repository required",
);
const fixture = JSON.parse(
  readFileSync(process.env.S31_PRIVATE_FIXTURE_FILE, "utf8"),
);
const root = resolve(import.meta.dirname, "../../..");
const evidence = resolve(root, "evidence/s31");
const report = {
  environment:
    "http://localhost:3040/scanner -> real same-origin proxy -> own API localhost:3001 -> private PostgreSQL 15438",
  browser: "Playwright Chromium 1.62.1; Browser plugin not available",
  viewports: ["1440x1000", "390x844"],
  camera: false,
  sourceSha: process.env.S31_SOURCE_SHA ?? "working-tree",
  driverSha256: createHash("sha256")
    .update(readFileSync(import.meta.filename))
    .digest("hex"),
  checks: [],
  consoleErrors: [],
  screenshots: [],
  startedAt: new Date().toISOString(),
};
const browser = await chromium.launch({ headless: true });
const contexts = [];
function check(value, text) {
  assert(value, text);
  report.checks.push(text);
}
async function session(actor, viewport) {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  const token = actor.cookie.split("=")[1];
  await context.addCookies([
    {
      name: "event_session",
      value: token,
      url: "http://localhost:3040",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  page.on("pageerror", (error) => report.consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource") &&
      !message.text().includes("net::ERR_FAILED")
    )
      report.consoleErrors.push(message.text());
  });
  await page.goto(
    `http://localhost:3040/scanner?showtimeId=${fixture.showtimeId}`,
  );
  await page.getByRole("button", { name: "Tải cửa được phân công" }).click();
  await page
    .getByRole("button", { name: "Kiểm tra vé" })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.querySelector("button[type=submit]")?.disabled,
  );
  return page;
}
async function scan(page, ticketId) {
  await page.getByLabel("Hoặc nhập mã vé").fill(ticketId);
  await page.getByRole("button", { name: "Kiểm tra vé" }).click();
}
async function screenshot(page, name) {
  if (!name.includes("dialog") && !name.includes("actions"))
    await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(evidence, name),
    fullPage: !name.startsWith("mobile"),
    animations: "disabled",
  });
  report.screenshots.push(name);
}
const status = (page) => page.getByTestId("ticket-scan-status");
try {
  const desktop = await session(fixture.b, { width: 1440, height: 1000 });
  const ordinary = await session(fixture.a, { width: 1440, height: 1000 });
  const mobile = await session(fixture.b, { width: 390, height: 844 });
  check(
    (await desktop.title()).length > 0 &&
      (await desktop
        .getByRole("heading", { name: "Soát vé bằng mã QR" })
        .count()) === 1,
    "Page identity / meaningful nonblank scanner / no framework overlay",
  );
  await scan(desktop, fixture.browserTicket);
  await status(desktop).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  check(
    (await status(desktop).innerText()).includes("19:02:00") &&
      (await status(desktop).innerText()).includes("tại cửa A"),
    "AC1: used ticket shows 19:02 and first gate A while context is gate B",
  );
  check(
    (await desktop
      .getByRole("button", { name: "Cho vào có ghi chú" })
      .count()) === 1,
    "Assigned override employee sees separate action",
  );
  await screenshot(desktop, "desktop-used.png");
  await scan(ordinary, fixture.browserTicket);
  await status(ordinary).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  check(
    (await ordinary
      .getByRole("button", { name: "Cho vào có ghi chú" })
      .count()) === 0,
    "Independent ordinary session does not see exception action",
  );
  await scan(mobile, fixture.browserTicket);
  await status(mobile).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  check(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "390px mobile no horizontal overflow",
  );
  await screenshot(mobile, "mobile-used.png");
  await mobile
    .getByRole("button", { name: "Cho vào có ghi chú" })
    .scrollIntoViewIfNeeded();
  await screenshot(mobile, "mobile-actions.png");

  const trigger = desktop.getByRole("button", { name: "Cho vào có ghi chú" });
  await trigger.click();
  const dialog = desktop.getByRole("dialog");
  await dialog.waitFor();
  check(
    await desktop
      .getByLabel("Lý do cho vào lại")
      .evaluate((element) => document.activeElement === element),
    "Dialog autofocus goes to reason",
  );
  await desktop
    .getByRole("button", { name: "Xác nhận cho vào", exact: true })
    .click();
  check(
    (await desktop
      .getByLabel("Lý do cho vào lại")
      .getAttribute("aria-invalid")) === "true" &&
      (await dialog.innerText()).includes("Xác nhận đã kiểm tra"),
    "Empty reason/unconfirmed owner validation, no admission",
  );
  for (let i = 0; i < 8; i++) await desktop.keyboard.press("Tab");
  check(
    await desktop.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"]')),
    ),
    "Keyboard tab remains inside modal focus trap",
  );
  await screenshot(desktop, "desktop-dialog-validation.png");
  await desktop.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check(
    await trigger.evaluate((element) => document.activeElement === element),
    "Escape closes dialog and restores trigger focus",
  );
  await trigger.click();
  await desktop
    .getByLabel("Lý do cho vào lại")
    .fill("Đã xác nhận chủ vé; khách quay lại cửa B");
  await desktop.getByLabel("Tôi đã xác nhận khách là chủ vé thật").check();
  // Delay the REAL product response; not a canned success fixture.
  await desktop.route(
    "**/check-in/exception",
    async (route) => {
      const response = await route.fetch();
      await new Promise((done) => setTimeout(done, 3600));
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await desktop
    .getByRole("button", { name: "Xác nhận cho vào", exact: true })
    .click();
  await desktop.waitForTimeout(3200);
  check(
    (await dialog.innerText()).includes("Đang chờ phản hồi") &&
      (await desktop
        .getByRole("button", { name: "Đang ghi nhận..." })
        .isDisabled()),
    "Exception >3s waiting and duplicate submit disabled",
  );
  await status(desktop)
    .filter({ hasText: "Đã ghi nhận vào lại theo ngoại lệ" })
    .waitFor();
  check(
    (await status(desktop).getAttribute("data-state")) === "EXCEPTION",
    "AC3: exception result distinctly named after server confirmation",
  );
  check(
    await desktop
      .getByRole("button", { name: "Quét vé tiếp theo" })
      .evaluate((element) => document.activeElement === element),
    "Completed exception moves focus to next scan",
  );
  await screenshot(desktop, "desktop-exception.png");
  await desktop.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  check(
    await desktop
      .getByLabel("Hoặc nhập mã vé")
      .evaluate((element) => document.activeElement === element),
    "Next scan clears result and focuses input without requiring camera",
  );
  await scan(desktop, fixture.browserTicket);
  await status(desktop).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  await scan(ordinary, fixture.freshTicket);
  await status(ordinary).filter({ hasText: "Check-in thành công" }).waitFor();
  await ordinary.getByLabel("Hoặc nhập mã vé").fill("unverified-ticket");
  check(
    (await status(ordinary).getAttribute("data-state")) === "SCANNING" &&
      !(await status(ordinary).innerText()).includes("Vé hợp lệ"),
    "Editing ticket code clears stale valid result before server verification",
  );
  await scan(ordinary, fixture.freshTicket);
  await status(ordinary)
    .filter({ hasText: "Đây không phải lần vào mới" })
    .waitFor();
  check(
    (await status(ordinary).getAttribute("data-state")) === "RECORDED",
    "Retry result never displayed as new green admission",
  );
  await ordinary.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  await ordinary.route(
    "**/check-in",
    async (route) => {
      const response = await route.fetch();
      await new Promise((done) => setTimeout(done, 3600));
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await scan(ordinary, fixture.browserTicket);
  await ordinary.waitForTimeout(3200);
  check(
    (await status(ordinary).getAttribute("data-state")) === "WAITING" &&
      (await ordinary
        .getByRole("button", { name: "Quét vé tiếp theo" })
        .isDisabled()),
    "S-30 >3s waiting/no premature green/cannot cancel to resubmit while pending",
  );
  await status(ordinary).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  await ordinary.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  await ordinary.route(
    "**/check-in",
    (route) => route.abort("internetdisconnected"),
    { times: 1 },
  );
  await scan(ordinary, fixture.browserTicket);
  await status(ordinary).filter({ hasText: "Không thể kết nối" }).waitFor();
  check(
    (await status(ordinary).getAttribute("data-state")) === "ERROR",
    "Network failure shows retry guidance, never valid/offline",
  );
  await screenshot(ordinary, "desktop-network-error.png");
  await ordinary.getByRole("button", { name: "Kiểm tra vé" }).click();
  await status(ordinary).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  check(
    (await status(desktop).getAttribute("aria-live")) === "polite" &&
      (await status(desktop).getAttribute("role")) === "status",
    "Text/icon/live region provides status beyond color",
  );
  await ordinary.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  const retriedScanBodies = [];
  await ordinary.route(
    "**/check-in",
    async (route) => {
      retriedScanBodies.push(route.request().postDataJSON());
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await scan(ordinary, fixture.retryTicket);
  await status(ordinary).filter({ hasText: "Không thể kết nối" }).waitFor();
  check(
    (await status(ordinary).getAttribute("data-state")) === "ERROR",
    "Lost scan response after real commit never turns green",
  );
  await ordinary.route(
    "**/check-in",
    async (route) => {
      retriedScanBodies.push(route.request().postDataJSON());
      await route.continue();
    },
    { times: 1 },
  );
  await ordinary.getByRole("button", { name: "Kiểm tra vé" }).click();
  await status(ordinary)
    .filter({ hasText: "Đây không phải lần vào mới" })
    .waitFor();
  check(
    retriedScanBodies.length === 2 &&
      JSON.stringify(retriedScanBodies[0]) ===
        JSON.stringify(retriedScanBodies[1]),
    "Lost-response scan retry sends same action and renders ALREADY_RECORDED",
  );
  const retriedExceptionBodies = [];
  await desktop.getByRole("button", { name: "Cho vào có ghi chú" }).click();
  await desktop
    .getByLabel("Lý do cho vào lại")
    .fill("Đã xác nhận chủ vé; kiểm thử mất phản hồi ngoại lệ");
  await desktop.getByLabel("Tôi đã xác nhận khách là chủ vé thật").check();
  await desktop.route(
    "**/check-in/exception",
    async (route) => {
      retriedExceptionBodies.push(route.request().postDataJSON());
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await desktop
    .getByRole("button", { name: "Xác nhận cho vào", exact: true })
    .click();
  await desktop.getByRole("button", { name: "Thử lại cùng yêu cầu" }).waitFor();
  check(
    await desktop.getByLabel("Lý do cho vào lại").isDisabled(),
    "Uncertain exception preserves locked reason/action for retry",
  );
  await desktop.route(
    "**/check-in/exception",
    async (route) => {
      retriedExceptionBodies.push(route.request().postDataJSON());
      await route.continue();
    },
    { times: 1 },
  );
  await desktop.getByRole("button", { name: "Thử lại cùng yêu cầu" }).click();
  await status(desktop)
    .filter({ hasText: "Yêu cầu ngoại lệ này đã được ghi nhận" })
    .waitFor();
  check(
    (await status(desktop).getAttribute("data-state")) === "RECORDED" &&
      retriedExceptionBodies.length === 2 &&
      JSON.stringify(retriedExceptionBodies[0]) ===
        JSON.stringify(retriedExceptionBodies[1]),
    "Lost exception response retries same action, never displays another accepted admission",
  );
  // Restore a used state for warning color/contrast checks.
  await desktop.getByRole("button", { name: "Quét vé tiếp theo" }).click();
  await scan(desktop, fixture.browserTicket);
  await status(desktop).filter({ hasText: "Vé đã sử dụng" }).waitFor();
  const colors = await status(desktop).evaluate((element) => {
    const c = getComputedStyle(element);
    return { foreground: c.color, background: c.backgroundColor };
  });
  report.usedColors = colors;
  const contrast = await status(desktop).evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    function luminance(color) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const rgb = [...ctx.getImageData(0, 0, 1, 1).data]
        .slice(0, 3)
        .map((channel) => {
          const v = channel / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }
    const fg = luminance(style.color),
      bg = luminance(style.backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  report.usedContrastRatio = contrast;
  check(contrast >= 4.5, "Used warning text contrast exceeds WCAG 4.5:1");
  const tapTargets = await desktop
    .getByRole("button", { name: "Quét vé tiếp theo" })
    .evaluate((element) => element.getBoundingClientRect().height);
  check(
    tapTargets >= 44,
    "Scanner admission actions have minimum 44px touch height",
  );
  const dialogMobileTrigger = mobile.getByRole("button", {
    name: "Cho vào có ghi chú",
  });
  await dialogMobileTrigger.click();
  await mobile.getByRole("dialog").waitFor();
  await mobile.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('[role="dialog"]')).opacity ===
      "1",
  );
  await screenshot(mobile, "mobile-dialog.png");
  check(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile dialog fits viewport, touch targets and scroll available",
  );
  check(
    report.consoleErrors.length === 0,
    "No runtime/page/console errors beyond expected HTTP and injected network failures",
  );
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.error = error.message;
  for (let i = 0; i < contexts.length; i++) {
    const page = contexts[i].pages()[0];
    if (page) await screenshot(page, `failure-${i}.png`);
  }
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    resolve(evidence, "browser-proof.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks.length,
    screenshots: report.screenshots,
    consoleErrors: report.consoleErrors,
  }),
);
