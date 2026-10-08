import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ORDER_HISTORY_TEST_PASSWORD,
  assertOrderHistoryTestDatabase,
} from "../apps/api/test/fixtures/order-history.ts";

const root = resolve(import.meta.dirname, "..");
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
apiRequire("dotenv").config({ path: resolve(root, ".env"), quiet: true });
assertOrderHistoryTestDatabase();
const { PrismaClient } = apiRequire("@prisma/client");
const { PrismaPg } = apiRequire("@prisma/adapter-pg");
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ?? "playwright",
);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const fixture = JSON.parse(
  await readFile(resolve(root, "output/playwright/s32/fixture.json"), "utf8"),
);
const origin = process.env.S32_WEB_ORIGIN ?? "http://localhost:3100";
assert.equal(new URL(origin).hostname, "localhost");
const output = resolve(root, "evidence/orders-integration/20261008/browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [],
  runtimeErrors = [],
  consoleErrors = [];
let faultInjection = false;
const userIds = Object.values(fixture.accounts).map((account) => account.id);
const snapshot = async () => ({
  orders: await db.order.findMany({
    where: { userId: { in: userIds } },
    orderBy: { id: "asc" },
  }),
  holds: await db.seatHold.findMany({
    where: { holdSession: { userId: { in: userIds } } },
    orderBy: { seatId: "asc" },
  }),
  holdSessions: await db.holdSession.findMany({
    where: { userId: { in: userIds } },
    orderBy: { id: "asc" },
  }),
});
const before = await snapshot();
const expectedIds = (who) =>
  fixture.orders
    .filter((order) => order.userId === who.id)
    .sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        (a.id < b.id ? 1 : -1),
    )
    .map((order) => order.id);
const aIds = expectedIds(fixture.accounts.a),
  bIds = expectedIds(fixture.accounts.b);
async function check(name, action) {
  try {
    await action();
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({ name, status: "failed", error: error.message });
    throw error;
  }
}
async function login(page, account, destination = "/orders?page=1") {
  await page.goto(
    `${origin}/login?returnTo=${encodeURIComponent(destination)}`,
  );
  await page.getByLabel(/Email/).fill(account.email);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(ORDER_HISTORY_TEST_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(`${origin}${destination}`);
}
function items(page, mobile) {
  return page.locator(
    mobile ? ".order-mobile-list > li" : ".order-table tbody > tr",
  );
}
async function ready(page, mobile, count) {
  await items(page, mobile).first().waitFor();
  assert.equal(await items(page, mobile).count(), count);
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
}
async function screen(page, name) {
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage: false,
  });
}

try {
  for (const [mode, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const mobile = mode === "mobile";
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      runtimeErrors.push({ mode, message: error.message }),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        consoleErrors.push({ mode, message: message.text(), faultInjection });
    });
    await check(`${mode}: real login returns to order history`, async () => {
      await login(page, fixture.accounts.a);
      await ready(page, mobile, 10);
    });
    await check(
      `${mode}: stable own-order sequence, all fields and terminal status labels`,
      async () => {
        const links = await items(page, mobile)
          .locator("a")
          .evaluateAll((elements) =>
            elements.map(
              (element) =>
                element.getAttribute("href").split("/")[2].split("?")[0],
            ),
          );
        assert.deepEqual(links, aIds.slice(0, 10));
        for (const label of [
          "Đã hủy",
          "Đã hết hạn",
          "Đã thanh toán",
          "Chờ thanh toán",
          "500.000 ₫",
        ])
          assert.ok(
            (await items(page, mobile).allTextContents())
              .join(" ")
              .includes(label),
          );
        const visibleText = await page.locator("body").innerText();
        assert.ok(!/demo|Sprint|S-32|Afterglow/i.test(visibleText));
        assert.ok(
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
            visibleText,
          ),
        );
        await noOverflow(page);
        await screen(page, `${mode}-history`);
      },
    );
    await check(`${mode}: keyboard focus and next-page action`, async () => {
      const next = page.getByRole("link", { name: "Trang sau", exact: true });
      await next.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      const focused = await next.evaluate((element) => ({
        focused: document.activeElement === element,
        outline: getComputedStyle(element).outlineStyle,
      }));
      assert.equal(focused.focused, true);
      assert.notEqual(focused.outline, "none");
      await page.keyboard.press("Enter");
      await page.waitForURL("**/orders?page=2");
      await ready(page, mobile, 4);
      assert.deepEqual(
        await items(page, mobile)
          .locator("a")
          .evaluateAll((elements) =>
            elements.map(
              (element) =>
                element.getAttribute("href").split("/")[2].split("?")[0],
            ),
          ),
        aIds.slice(10),
      );
      await screen(page, `${mode}-page2`);
    });
    await check(
      `${mode}: detail, actual seats and back preserve the page`,
      async () => {
        await items(page, mobile)
          .first()
          .getByRole("link", { name: /Xem chi tiết/ })
          .click();
        await page.getByRole("heading", { name: "Ghế đã đặt" }).waitFor();
        assert.equal(
          await page.locator(".order-seat-panel tbody tr").count(),
          2,
        );
        assert.ok(
          (await page.locator(".order-seat-panel").innerText()).includes(
            "250.000 ₫",
          ),
        );
        await noOverflow(page);
        await screen(page, `${mode}-detail`);
        await page
          .getByRole("link", { name: "← Đơn hàng của tôi", exact: true })
          .click();
        await page.waitForURL("**/orders?page=2");
        await ready(page, mobile, 4);
        await page.reload();
        await ready(page, mobile, 4);
      },
    );
    await check(
      `${mode}: authenticated cross-account request receives real HTTP 403`,
      async () => {
        const forbidden = await context.request.get(
          `${origin}/api/orders/${bIds[0]}`,
        );
        assert.equal(forbidden.status(), 403);
        const body = await forbidden.json();
        assert.equal(body.order, undefined);
        assert.ok(!JSON.stringify(body).includes(bIds[0]));
        await page.goto(`${origin}/orders/${bIds[0]}`);
        await page
          .getByText("Không có quyền xem đơn hàng", { exact: true })
          .waitFor();
        assert.ok(
          !(await page.locator(".order-page").innerText()).includes(
            "Hòa nhạc mùa thu",
          ),
        );
        await screen(page, `${mode}-forbidden`);
      },
    );
    await check(
      `${mode}: cancelled and expired detail remain readable`,
      async () => {
        for (const [index, label] of [
          [2, "Đã hủy"],
          [4, "Đã hết hạn"],
        ]) {
          await page.goto(
            `${origin}/orders/${fixture.orders[index].id}?page=1`,
          );
          await page.getByRole("heading", { name: "Ghế đã đặt" }).waitFor();
          assert.ok(
            (await page.locator(".order-page").innerText()).includes(label),
          );
        }
        await screen(page, `${mode}-expired`);
      },
    );
    await check(
      `${mode}: legacy pending keeps S-17 payment/countdown and terminal orders hide payment`,
      async () => {
        await page.goto(`${origin}/orders/${fixture.orders[5].id}`);
        await page.getByRole("heading", { name: "Ghế đã đặt" }).waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Thanh toán", exact: true })
            .isEnabled(),
          true,
        );
        assert.ok((await page.getByRole("timer").innerText()).includes("Còn "));
        await screen(page, `${mode}-pending`);
        for (const index of [1, 2, 4, 6]) {
          await page.goto(`${origin}/orders/${fixture.orders[index].id}`);
          await page.getByRole("heading", { name: "Ghế đã đặt" }).waitFor();
          assert.equal(
            await page
              .getByRole("button", { name: "Thanh toán", exact: true })
              .count(),
            0,
          );
        }
        assert.ok(
          (await page.locator(".order-page").innerText()).includes(
            "Cần kiểm tra",
          ),
        );
      },
    );
    await check(
      `${mode}: delayed real request renders a skeleton before content`,
      async () => {
        let release, entered;
        const blocked = new Promise((resolvePromise) => {
          release = resolvePromise;
        });
        const intercepted = new Promise((resolvePromise) => {
          entered = resolvePromise;
        });
        await page.route("**/api/orders/me?*", async (route) => {
          entered();
          await blocked;
          await route.continue();
        });
        await page.goto(`${origin}/orders?page=2`);
        await intercepted;
        await page.getByRole("status", { name: "Đang tải đơn hàng" }).waitFor();
        await screen(page, `${mode}-loading`);
        release();
        await ready(page, mobile, 4);
        await page.unroute("**/api/orders/me?*");
      },
    );
    await check(`${mode}: network error and retry keep page 2`, async () => {
      faultInjection = true;
      await page.route("**/api/orders/me?*", (route) => route.abort("failed"));
      await page.goto(`${origin}/orders?page=2`);
      await page
        .getByText("Không tải được đơn hàng", { exact: true })
        .waitFor();
      await screen(page, `${mode}-error`);
      await page.unroute("**/api/orders/me?*");
      await page.getByRole("button", { name: "Thử lại", exact: true }).click();
      await ready(page, mobile, 4);
      assert.ok(page.url().endsWith("/orders?page=2"));
      faultInjection = false;
    });
    await check(
      `${mode}: direct out-of-range and malformed URLs render safe recovery`,
      async () => {
        await page.goto(`${origin}/orders?page=999`);
        await page
          .getByText("Trang này không có đơn hàng", { exact: true })
          .waitFor();
        await page
          .getByRole("link", { name: "Về trang cuối có đơn", exact: true })
          .click();
        await ready(page, mobile, 4);
        await page.goto(`${origin}/orders?page=abc`);
        await page.getByText("Trang không hợp lệ", { exact: true }).waitFor();
      },
    );
    await check(
      `${mode}: expired session guides login and restores the exact detail URL`,
      async () => {
        await db.session.updateMany({
          where: { userId: fixture.accounts.a.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        const destination = `/orders/${aIds[10]}?page=2`;
        await page.goto(`${origin}${destination}`);
        await page
          .getByText("Vui lòng đăng nhập lại", { exact: true })
          .waitFor();
        await page
          .locator(".order-page")
          .getByRole("link", { name: "Đăng nhập", exact: true })
          .click();
        await page.waitForURL("**/login?returnTo=*");
        assert.ok(page.url().includes(encodeURIComponent(destination)));
        await page.getByLabel(/Email/).fill(fixture.accounts.a.email);
        await page
          .getByLabel("Mật khẩu", { exact: true })
          .fill(ORDER_HISTORY_TEST_PASSWORD);
        await page
          .getByRole("button", { name: "Đăng nhập", exact: true })
          .click();
        await page.waitForURL(`${origin}${destination}`);
        await page.getByRole("heading", { name: "Ghế đã đặt" }).waitFor();
      },
    );
    await check(
      `${mode}: logout/back and account switch never show A's orders`,
      async () => {
        await page.goto(`${origin}/account`);
        await page
          .getByRole("heading", { name: "Thông tin tài khoản", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Đăng xuất", exact: true })
          .filter({ visible: true })
          .click();
        await page.waitForURL("**/login");
        await page.goBack();
        await page
          .getByText("Vui lòng đăng nhập lại", { exact: true })
          .waitFor();
        assert.equal(await page.locator(".order-code").count(), 0);
        await page.goto(`${origin}/orders?page=1`);
        await page
          .getByText("Vui lòng đăng nhập lại", { exact: true })
          .waitFor();
        assert.equal(await page.locator(".order-code").count(), 0);
        await login(page, fixture.accounts.b);
        await ready(page, mobile, 3);
        const own = await context.request.get(`${origin}/api/orders/me`);
        assert.deepEqual(
          (await own.json()).orders.map((order) => order.id),
          bIds,
        );
        const forbidden = await context.request.get(
          `${origin}/api/orders/${aIds[0]}`,
        );
        assert.equal(forbidden.status(), 403);
        const aCodes = aIds.map(
          (id) =>
            `DH-${BigInt(`0x${id.replaceAll("-", "")}`)
              .toString(36)
              .toUpperCase()}`,
        );
        for (const code of aCodes)
          assert.ok(!(await page.locator("body").innerText()).includes(code));
      },
    );
    await check(
      `${mode}: switching account in another tab revalidates private history`,
      async () => {
        await login(page, fixture.accounts.a);
        await ready(page, mobile, 10);
        const observer = await context.newPage();
        await observer.goto(`${origin}/orders`);
        await ready(observer, mobile, 10);
        await login(page, fixture.accounts.b);
        await ready(page, mobile, 3);
        await observer.bringToFront();
        await observer.waitForFunction(() =>
          document
            .querySelector(".order-pagination")
            ?.textContent.includes("3 đơn"),
        );
        await ready(observer, mobile, 3);
        assert.deepEqual(
          await items(observer, mobile)
            .locator("a")
            .evaluateAll((elements) =>
              elements.map(
                (element) =>
                  element.getAttribute("href").split("/")[2].split("?")[0],
              ),
            ),
          bIds,
        );
        await observer.close();
        await page.bringToFront();
      },
    );
    await check(`${mode}: real empty buyer has discovery action`, async () => {
      await login(page, fixture.accounts.empty);
      await page.getByText("Bạn chưa có đơn hàng", { exact: true }).waitFor();
      await page
        .getByRole("link", { name: "Khám phá sự kiện", exact: true })
        .waitFor();
      await noOverflow(page);
      await screen(page, `${mode}-empty`);
    });
    await check(
      `${mode}: catalog and orders share V1 palette/fonts at the same viewport`,
      async () => {
        await page.goto(origin);
        await page.locator(".product").waitFor();
        const tokens = await page.locator(".product").evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            primary: styles.getPropertyValue("--primary").trim(),
            background: styles.getPropertyValue("--background").trim(),
            font: styles.fontFamily,
          };
        });
        assert.equal(tokens.primary, "#0045a9");
        assert.equal(tokens.background, "#faf8ff");
        assert.ok(tokens.font.includes("Geist"));
        await screen(page, `${mode}-v1-reference`);
        await page.goto(`${origin}/orders`);
        await page.getByText("Bạn chưa có đơn hàng", { exact: true }).waitFor();
        const orderTokens = await page
          .locator(".product")
          .evaluate((element) => {
            const styles = getComputedStyle(element);
            return {
              primary: styles.getPropertyValue("--primary").trim(),
              background: styles.getPropertyValue("--background").trim(),
              font: styles.fontFamily,
            };
          });
        assert.deepEqual(orderTokens, tokens);
        assert.equal(
          await page.locator("nextjs-portal [data-nextjs-dialog]").count(),
          0,
        );
      },
    );
    await context.close();
  }
  await check(
    "Opening history/detail does not mutate orders, hold ownership or deadlines",
    async () => assert.deepEqual(await snapshot(), before),
  );
  await check("No page runtime exceptions", async () =>
    assert.deepEqual(runtimeErrors, []),
  );
  // HTTP 401/403 and deliberately aborted fault-injection requests are expected.
  const unexpected = consoleErrors.filter(
    (error) =>
      !error.faultInjection &&
      !/Failed to load resource.*(401|403|400|404)/.test(error.message),
  );
  await check("No unexpected console errors", async () =>
    assert.deepEqual(unexpected, []),
  );
} catch (error) {
  if (!results.some((result) => result.status === "failed"))
    results.push({
      name: "Browser runner",
      status: "failed",
      error: error.message,
    });
} finally {
  const report = {
    origin,
    browser: "Playwright Chromium (bundled runtime)",
    viewports: [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ],
    results,
    runtimeErrors,
    consoleErrors,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
  };
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        failed: report.failed,
        failures: results.filter((result) => result.status === "failed"),
      },
      null,
      2,
    ),
  );
  await browser.close();
  await db.$disconnect();
  if (report.failed) process.exitCode = 1;
}
