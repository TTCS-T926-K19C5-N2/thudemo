async (page) => {
  const root = __TASK_ROOT__,
    password = __LOCAL_PASSWORD__,
    competitor = __COMPETITOR__;
  const base = "http://localhost:3000",
    show = "c0100401-0000-4000-8000-000000000001";
  const checks = [],
    screens = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const verify = (value, name) => {
    if (!value) throw Error(name);
    checks.push(name);
  };
  const shot = async (name, width) => {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll(".product-map-scroll").forEach((el) => {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      });
    });
    const state = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      text: document.body.innerText,
      font: getComputedStyle(document.querySelector(".product")).fontFamily,
      summary: document
        .querySelector(".seat-summary")
        .getBoundingClientRect()
        .toJSON(),
    }));
    verify(state.width <= width, "No overflow " + name);
    verify(
      !/Demo|Sprint\s*2|T-\d\d|K-01/.test(state.text),
      "No internal labels " + name,
    );
    await page.screenshot({
      path: root + __CAPTURE_DIRECTORY__ + "" + name + ".png",
      fullPage: true,
    });
    screens.push({ name, width, font: state.font, summary: state.summary });
  };
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.context().clearCookies();
  await page.goto(
    base + "/login?returnTo=" + encodeURIComponent("/shows/" + show + "/seats"),
  );
  await page
    .getByLabel("Email / Tên đăng nhập")
    .fill("design-buyer@example.invalid");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("**/shows/" + show + "/seats");
  await page.locator('canvas[data-rendered="2000"]').waitFor();
  await page.locator("canvas").press("Enter");
  await page.locator("canvas").press("ArrowRight");
  await page.locator("canvas").press("Enter");
  verify(
    await page
      .getByRole("button", { name: "Giữ ghế", exact: true })
      .isEnabled(),
    "Keyboard two seats, real hold action enabled",
  );
  await page.route("**/api/showtimes/" + show + "/holds", async (route) => {
    if (route.request().method() === "POST")
      await new Promise((r) => setTimeout(r, 400));
    await route.continue();
  });
  await page.getByRole("button", { name: "Giữ ghế", exact: true }).click();
  await page
    .getByRole("button", { name: "Đang xác nhận…", exact: true })
    .waitFor();
  await shot("pending-1280", 1280);
  await page.getByText("Máy chủ đã xác nhận", { exact: true }).waitFor();
  await page.unroute("**/api/showtimes/" + show + "/holds");
  const state = await page.evaluate(async (show) => {
    const r = await fetch("/api/showtimes/" + show + "/holds");
    return r.json();
  }, show);
  verify(
    state.hold.seatIds.length === 2,
    "HTTP confirmed two seats, no draft-only success",
  );
  await shot("held-1280", 1280);
  await shot("held-390", 390);
  await shot("held-360", 360);
  await page.reload();
  await page.getByText("Máy chủ đã xác nhận", { exact: true }).waitFor();
  const reloaded = await page.evaluate(
    async (show) => (await fetch("/api/showtimes/" + show + "/holds")).json(),
    show,
  );
  verify(
    reloaded.hold.expiresAt === state.hold.expiresAt,
    "Reload retains exact original deadline",
  );
  // Wrong client wall time is a browser fixture, never a product clock fallback.
  await page.evaluate(() => {
    window.__OriginalDate = Date;
    const Native = Date;
    window.Date = class extends Native {
      constructor(...args) {
        if (args.length) super(...args);
        else super(Native.now() + 3600000);
      }
      static now() {
        return Native.now() + 3600000;
      }
    };
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => {
    const text = document.querySelector(
      'output[aria-label="Thời gian giữ ghế"]',
    ).textContent;
    return /^0[89]:/.test(text);
  });
  verify(true, "Client wall clock +1 hour does not reset countdown");
  await page.evaluate(() => {
    window.Date = window.__OriginalDate;
    window.dispatchEvent(new Event("online"));
  });
  const secondContext = await page.context().browser().newContext();
  const second = await secondContext.newPage();
  await second.goto(
    base + "/login?returnTo=" + encodeURIComponent("/shows/" + show + "/seats"),
  );
  await second.getByLabel("Email / Tên đăng nhập").fill(competitor.email);
  await second.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await second.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await second.waitForURL("**/shows/" + show + "/seats");
  await second.locator('canvas[data-rendered="2000"]').waitFor();
  const map = await page.evaluate(
    async (show) => (await fetch("/api/showtimes/" + show + "/seats")).json(),
    show,
  );
  const third = map[2];
  await page.locator("canvas").press("ArrowRight");
  await page.locator("canvas").press("ArrowRight");
  await page.locator("canvas").press("Enter");
  const other = await second.evaluate(
    async ({ show, seatId }) => {
      const r = await fetch("/api/showtimes/" + show + "/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatIds: [seatId] }),
      });
      return { status: r.status, body: await r.json() };
    },
    { show, seatId: third.id },
  );
  verify(
    other.status === 200,
    "Independent buyer really holds the pending draft seat",
  );
  await page.getByRole("button", { name: "Giữ thêm ghế", exact: true }).click();
  await page.getByText(/vừa được người khác giữ/).waitFor();
  await shot("conflict-1280", 1280);
  await shot("conflict-390", 390);
  await shot("conflict-360", 360);
  const afterConflict = await page.evaluate(
    async (show) => (await fetch("/api/showtimes/" + show + "/holds")).json(),
    show,
  );
  verify(
    afterConflict.hold.seatIds.length === 2 &&
      afterConflict.hold.expiresAt === state.hold.expiresAt,
    "Conflict did not alter already-confirmed rights/deadline",
  );
  await secondContext.close();
  await page
    .getByRole("button", { name: "Làm mới sơ đồ & Chọn lại", exact: true })
    .click();
  // A dropped response after a real successful POST is reconciled through authenticated GET.
  await page.locator("canvas").press("ArrowRight");
  await page.locator("canvas").press("Enter");
  let resolveDropped;
  const dropped = new Promise((resolve) => {
    resolveDropped = resolve;
  });
  await page.route("**/api/showtimes/" + show + "/holds", async (route) => {
    if (route.request().method() === "POST") {
      await route.fetch();
      await route.abort("failed");
      resolveDropped();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Giữ thêm ghế", exact: true }).click();
  await dropped;
  await page.waitForFunction(() =>
    document.querySelector(".seat-summary h2")?.textContent.includes("(3)"),
  );
  await page.unroute("**/api/showtimes/" + show + "/holds");
  verify(
    true,
    "Lost response is reconciled from server: three real rights, no fake success",
  );
  await shot("network-reconciled-390", 390);
  const final = await page.evaluate(
    async (show) => (await fetch("/api/showtimes/" + show + "/holds")).json(),
    show,
  );
  verify(
    final.hold.expiresAt === state.hold.expiresAt,
    "Lost-response retry/reconcile never extends deadline",
  );
  return {
    holdIds: [final.hold.id],
    deadline: final.hold.expiresAt,
    seatIds: final.hold.seatIds,
    checks,
    screens,
    errors,
    local: true,
    staging: false,
  };
};
