import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ORDER_HISTORY_TEST_PASSWORD,
  assertOrderHistoryTestDatabase,
} from "../apps/api/test/fixtures/order-history.ts";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "apps/api/package.json"));
require("dotenv").config({ path: resolve(root, ".env"), quiet: true });
assertOrderHistoryTestDatabase();
assert.equal(process.env.PAYMENT_GATEWAY, "mock");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ?? "playwright",
);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const fixture = JSON.parse(
  await readFile(resolve(root, "output/playwright/s32/fixture.json"), "utf8"),
);
const order = fixture.orders[0];
const origin = process.env.S32_WEB_ORIGIN ?? "http://localhost:3200";
assert.equal(new URL(origin).hostname, "localhost");
const output = resolve(
  root,
  "evidence/orders-integration/20261008/payment-continuation",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const originalCategory = await db.seatCategory.findUniqueOrThrow({
  where: { id: order.categoryId },
});
try {
  await db.seatCategory.update({
    where: { id: order.categoryId },
    data: { price: 900000 },
  });
  const before = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  const holdsBefore = await db.seatHold.findMany({
    where: { holdSessionId: order.holdId },
    orderBy: { seatId: "asc" },
  });
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const mode = viewport.width === 390 ? "mobile" : "desktop";
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const runtimeErrors = [],
      consoleErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    try {
      await page.goto(
        `${origin}/login?returnTo=${encodeURIComponent(`/orders/${order.id}`)}`,
      );
      await page.getByLabel(/Email/).fill(fixture.accounts.a.email);
      await page
        .getByLabel("Mật khẩu", { exact: true })
        .fill(ORDER_HISTORY_TEST_PASSWORD);
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await page.getByRole("heading", { name: "Ghế đã đặt" }).waitFor();
      await page
        .getByRole("button", { name: "Thanh toán", exact: true })
        .click();
      await page.waitForURL("**/mock-gateway/pay?**");
      await page
        .getByRole("heading", { name: "Cổng thanh toán giả lập", exact: true })
        .waitFor();
      const redirect = new URL(page.url());
      assert.equal(redirect.searchParams.get("amount"), "500000");
      const payment = await db.payment.findUniqueOrThrow({
        where: { gatewayRef: redirect.searchParams.get("gatewayRef") },
      });
      assert.equal(payment.amount, 500000);
      assert.equal(payment.gateway, "mock");
      assert.equal(payment.status, "INITIATED");
      assert.deepEqual(
        await db.order.findUniqueOrThrow({ where: { id: order.id } }),
        before,
      );
      assert.deepEqual(
        await db.seatHold.findMany({
          where: { holdSessionId: order.holdId },
          orderBy: { seatId: "asc" },
        }),
        holdsBefore,
      );
      assert.deepEqual(runtimeErrors, []);
      assert.deepEqual(consoleErrors, []);
      await page.screenshot({ path: resolve(output, `${mode}.png`) });
      results.push({
        name: `${mode}: V1 detail -> existing mock gateway; booked amount unchanged despite live price change`,
        status: "passed",
        amount: payment.amount,
        paymentStatus: payment.status,
        orderAndHoldUnchanged: true,
      });
    } catch (error) {
      results.push({
        name: mode,
        status: "failed",
        error: String(error),
        runtimeErrors,
        consoleErrors,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await db.seatCategory.update({
    where: { id: order.categoryId },
    data: { price: originalCategory.price },
  });
  await browser.close();
  await db.$disconnect();
}
const report = {
  origin,
  gateway: "mock (no settlement submitted, no real money)",
  results,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length,
};
await writeFile(
  resolve(output, "results.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
