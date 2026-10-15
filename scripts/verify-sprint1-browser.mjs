import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { stagingConfig, stagingRelease } from "../deploy/laptop-gateway.mjs";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, ".."),
  apiRequire = createRequire(resolve(root, "apps/api/package.json"));
const staging = process.argv.includes("--staging");
const stage = staging
  ? stagingConfig(
      JSON.parse(readFileSync(resolve(root, ".sprint1-staging/config.json"))),
    )
  : null;
const active = staging
  ? stagingRelease(
      JSON.parse(readFileSync(resolve(root, ".sprint1-staging/active.json"))),
    )
  : null;
if (!staging)
  apiRequire("dotenv").config({ path: resolve(root, ".env"), quiet: true });
const databaseUrl = staging
  ? `postgresql://${stage.user}:${stage.dbPassword}@127.0.0.1:${stage.pgPort}/${stage.database}?schema=public`
  : process.env.DATABASE_URL;
let target;
try {
  target = new URL(databaseUrl ?? "");
} catch {
  throw new Error("Invalid local DATABASE_URL configuration");
}
assert(
  target.hostname === "127.0.0.1" &&
    target.port === (staging ? "15455" : "15445") &&
    target.pathname ===
      (staging ? "/sprint1_staging_20261015" : "/sprint1_gitflow_20261015"),
  "Exact isolated demo database required",
);
const { chromium } = createRequire(resolve(root, "apps/web/package.json"))(
  "playwright",
);
const { PrismaClient } = apiRequire("@prisma/client"),
  { PrismaPg } = apiRequire("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const config = JSON.parse(
    readFileSync(
      resolve(
        root,
        staging ? ".sprint1-staging/config.json" : ".sprint1-local/config.json",
      ),
    ),
  ),
  origin = staging
    ? `https://${stage.lanAddress}:${stage.gatewayPort}`
    : `http://localhost:${config.webPort}`;
const out = resolve(
  root,
  staging
    ? "evidence/sprint1/20261015-handoff/staging-browser"
    : "evidence/sprint1/20261015-gitflow/browser",
);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  results = [],
  errors = [],
  consoleErrors = [],
  expectedHttp = [];
const a = config.accounts.find((x) => x.email.startsWith("organizer-a@")),
  b = config.accounts.find((x) => x.email.startsWith("organizer-b@"));
let injection = false;
function observe(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !injection) consoleErrors.push(m.text());
  });
}
const pass = (name, extra = {}) => {
  results.push({ name, status: "PASS", ...extra });
  console.log("PASS", name);
};
async function login(page, account) {
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(account.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("**/events");
}
async function stable(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.title.length > 0);
  assert(
    !(await page.locator("body").innerText()).includes("Application error"),
  );
  assert(await page.title());
  assert((await page.locator("body").innerText()).length > 100);
}
try {
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "America/Los_Angeles",
    }),
    page = await ctx.newPage();
  observe(page);
  await page.goto(origin + "/login");
  await stable(page);
  await page.screenshot({ path: resolve(out, "desktop-login.png") });
  await page.locator("#login-email").focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator("#login-password")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  pass("login-desktop-identity-nonblank-keyboard");
  await login(page, a);
  await stable(page);
  assert.equal(
    await page.getByRole("link", { name: /đối soát|kế toán/i }).count(),
    0,
  );
  pass("organizer-login-events-no-accounting");
  await page.goto(origin + "/events/new");
  await page.locator("#event-name").waitFor();
  await page.getByRole("button", { name: "Tạo sự kiện", exact: true }).click();
  await page.locator("#name-error").waitFor();
  assert.equal(
    await page.locator("#event-name").getAttribute("aria-invalid"),
    "true",
  );
  pass("empty-form-inline-errors");
  const name = "Sprint1 UI " + Date.now();
  await page.locator("#event-name").fill(name);
  await page.locator("#event-location").fill("Phòng demo Việt Nam");
  await page.locator("#event-description").fill("Dữ liệu giả cho Sprint 1");
  // Two submit events in one turn exercise the synchronous useRef lock, beyond disabled styling.
  await page
    .locator('form[aria-labelledby="event-form-title"]')
    .evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split("/")[2];
  await page.locator("#showtime-start").waitFor();
  assert.equal(await db.event.count({ where: { name } }), 1);
  pass("double-submit-one-draft", { eventId: id });
  await page.locator("#event-name").fill(name + " sửa");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Đã lưu" }).waitFor();
  await page.reload();
  await page.locator("#showtime-start").waitFor();
  assert.equal(await page.locator("#event-name").inputValue(), name + " sửa");
  pass("edit-reload-persist");
  await page.locator("#showtime-start").fill("2020-01-01T10:00");
  await page
    .getByRole("button", { name: "Thêm suất diễn", exact: true })
    .click();
  await page.locator("#start-error").waitFor();
  assert.equal(
    await page.locator("#showtime-start").inputValue(),
    "2020-01-01T10:00",
  );
  pass("past-time-inline-error-retains-input");
  const time = "2099-01-01T00:30";
  await page.locator("#showtime-start").fill(time);
  await page
    .getByRole("button", { name: "Thêm suất diễn", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "Đã thêm" }).waitFor();
  assert.equal(
    (
      await db.showtime.findFirstOrThrow({ where: { eventId: id } })
    ).startTime.toISOString(),
    "2098-12-31T17:30:00.000Z",
  );
  await page.locator("#showtime-start").fill(time);
  await page
    .getByRole("button", { name: "Thêm suất diễn", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "cùng giờ" }).waitFor();
  assert.equal(await db.showtime.count({ where: { eventId: id } }), 2);
  await page.reload();
  await page.locator(".operations-showtimes li").first().waitFor();
  assert.match(
    await page.locator(".operations-showtimes").innerText(),
    /00:30/,
  );
  pass(
    "future-vietnam-time-in-US-browser-duplicate-warning-two-records-reload",
  );
  await page.screenshot({
    path: resolve(out, "desktop-event.png"),
    fullPage: true,
  });
  // A real server-side validation error must preserve the entered event fields.
  const inputBefore = await page.locator("#event-name").inputValue();
  await page.route("**/api/events/" + id, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      await route.continue({
        postData: JSON.stringify({ ...body, location: "" }),
      });
    } else await route.continue();
  });
  injection = true;
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.locator("#location-error").waitFor();
  assert.equal(await page.locator("#event-name").inputValue(), inputBefore);
  assert.equal(
    await page.locator("#event-location").inputValue(),
    "Phòng demo Việt Nam",
  );
  await page.unroute("**/api/events/" + id);
  injection = false;
  await page.locator("#event-location").fill("Phòng demo đã phục hồi");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Đã lưu" }).waitFor();
  pass("real-server400-field-error-input-retained-recovery");
  await page.locator("#event-name").fill(name + " khôi phục phiên");
  const owner = await db.user.findUniqueOrThrow({ where: { email: a.email } });
  // Expire only the session created by this browser, preserving human/demo tabs.
  // An independent new fixture session proves the mutation cannot revoke all A sessions.
  const parallel = await browser.newContext();
  const parallelPage = await parallel.newPage();
  await parallelPage.goto(origin + "/login");
  await login(parallelPage, a);
  const sessionHash = async (context) => {
    const cookie = (await context.cookies(origin)).find(
      (value) => value.name === "event_session",
    );
    assert(cookie, "The verification context must own a session cookie");
    return createHash("sha256").update(cookie.value).digest("hex");
  };
  const currentHash = await sessionHash(ctx),
    parallelHash = await sessionHash(parallel);
  assert.notEqual(currentHash, parallelHash);
  const parallelBefore = await db.session.findUniqueOrThrow({
    where: { tokenHash: parallelHash },
  });
  const affected = await db.session.updateMany({
    where: { userId: owner.id, tokenHash: currentHash },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(affected.count, 1);
  assert.equal(
    (
      await db.session.findUniqueOrThrow({ where: { tokenHash: parallelHash } })
    ).expiresAt.toISOString(),
    parallelBefore.expiresAt.toISOString(),
  );
  assert.equal(
    await parallelPage.evaluate(
      async () => (await fetch("/api/auth/me")).status,
    ),
    200,
  );
  assert.equal(
    await parallelPage.evaluate(
      async () => (await fetch("/api/auth/logout", { method: "POST" })).status,
    ),
    200,
  );
  await parallel.close();
  injection = true;
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.waitForURL("**/login?returnTo=*");
  await page.locator("#login-email").fill(a.email);
  await page.locator("#login-password").fill(a.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("**/events/" + id);
  await page.locator("#showtime-start").waitFor();
  assert.equal(
    await page.locator("#event-name").inputValue(),
    name + " khôi phục phiên",
  );
  injection = false;
  pass("expired-session401-login-return-restores-same-owner-draft", {
    expiryScope:
      "Only this context tokenHash; independent same-owner session remains valid",
  });
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Đã lưu" }).waitFor();
  const other = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: "Asia/Ho_Chi_Minh",
    }),
    p = await other.newPage();
  observe(p);
  await p.goto(origin + "/login");
  await login(p, b);
  await p.goto(origin + "/events/" + id);
  injection = true;
  await p
    .getByRole("heading", { name: "Bạn không có quyền sửa sự kiện này" })
    .waitFor();
  await p.screenshot({
    path: resolve(out, "mobile-owner-denied.png"),
    fullPage: true,
  });
  injection = false;
  pass("other-organizer-direct-url-denied-mobile");
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: "Asia/Ho_Chi_Minh",
    }),
    m = await mobile.newPage();
  observe(m);
  await m.goto(origin + "/login");
  await login(m, a);
  await m.goto(origin + "/events/" + id);
  await m.locator("#showtime-start").waitFor();
  await stable(m);
  assert(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await m.screenshot({
    path: resolve(out, "mobile-event.png"),
    fullPage: true,
  });
  pass("mobile390-editor-no-overflow");
  // Loading and API outage are real rendered states; no fixture content is shown as success.
  await m.route("**/api/events/" + id + "/manage", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await m.reload({ waitUntil: "domcontentloaded" });
  await m.getByRole("status", { name: "Đang tải sự kiện" }).waitFor();
  await m.locator("#showtime-start").waitFor();
  await m.unroute("**/api/events/" + id + "/manage");
  pass("loading-state");
  injection = true;
  await m.route("**/api/events/" + id + "/manage", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected isolated outage" }),
    }),
  );
  await m.reload();
  await m.getByRole("alert").filter({ hasText: "Không tải được" }).waitFor();
  await m.unroute("**/api/events/" + id + "/manage");
  await m.reload();
  await m.locator("#showtime-start").waitFor();
  injection = false;
  pass("error-state-reload-recovery");
  assert.deepEqual(errors, []);
  pass("no-page-runtime-errors");
  // Browser logs include expected 400/401/403 from deliberately negative tests.
  const unexpected = consoleErrors.filter(
    (e) =>
      !/^Failed to load resource: the server responded with a status of (400|401|403)/.test(
        e,
      ),
  );
  assert.deepEqual(unexpected, []);
  pass("no-unexpected-console-errors", {
    expectedNegativeHttpErrors: consoleErrors.length,
  });
  writeFileSync(
    resolve(out, "results.json"),
    JSON.stringify(
      {
        origin,
        source: active?.sha ?? "Local source manifest applies",
        environment: staging
          ? "Actual laptop staging HTTPS, system trusted certificate, no ignoreHTTPSErrors"
          : "Isolated local demo",
        viewports: ["1440x1000 US timezone", "390x844 Vietnam"],
        results,
        pageErrors: errors,
        unexpectedConsoleErrors: unexpected,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    resolve(
      root,
      staging
        ? ".sprint1-staging/browser-fixture.json"
        : ".sprint1-local/browser-fixture.json",
    ),
    JSON.stringify({ eventId: id }),
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
