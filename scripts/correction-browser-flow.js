async (page) => {
  const root = __TASK_ROOT__;
  const password = __LOCAL_PASSWORD__;
  const base = __BASE_URL__;
  const evidence = root + __CAPTURE_DIRECTORY__;
  const publicId = "c0100401-0000-4000-8000-000000000001";
  const eventId = "c0100400-0000-4000-8000-000000000001";
  const checks = [],
    screenChecks = [],
    errors = [],
    consoleMessages = [],
    errorResponses = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errorResponses.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
  const verify = (condition, label) => {
    if (!condition) throw Error(label);
    checks.push(label);
  };
  const viewport = (width) =>
    page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
  const shot = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => ({
      text: document.body.innerText,
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      font: getComputedStyle(document.querySelector(".product")).fontFamily,
      fonts: document.fonts.status,
      materialFontLoaded:
        document.fonts.check('400 24px "Material Symbols Outlined"') &&
        [...document.fonts].some(
          (font) =>
            font.family.includes("Material Symbols Outlined") &&
            font.status === "loaded",
        ),
      title: document.title,
      devicePixelRatio: window.devicePixelRatio,
      geometry: [
        ...document.querySelectorAll(
          ".public-header,.organizer-header,.organizer-sidebar,.catalog-hero,.catalog-row,.catalog-poster,.product-login,.detail-hero,.detail-tiers,.price-table,.import-columns,.product-map,.seat-summary,.login-fields,.login-submit,[data-slot=field-label],[data-slot=input],.showtime-list a,.price-table tr,.mobile-public-nav,.material-symbol",
        ),
      ].map((element) => {
        const style = getComputedStyle(element),
          rect = element.getBoundingClientRect();
        return {
          selector: element.className,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
          fontVariationSettings: style.fontVariationSettings,
          lineHeight: style.lineHeight,
          padding: style.padding,
          background: style.backgroundColor,
          borderRadius: style.borderRadius,
        };
      }),
    }));
    verify(
      !/Demo|Sprint\s*2|K-01|T-\d\d|dữ liệu giả|giả lập/i.test(
        state.text + state.title,
      ),
      "No internal labels: " + name,
    );
    verify(
      state.materialFontLoaded,
      "Local Material Symbols font loaded: " + name,
    );
    verify(state.width <= state.viewport, "No page overflow: " + name);
    screenChecks.push({
      name,
      font: state.font,
      fonts: state.fonts,
      materialFontLoaded: state.materialFontLoaded,
      viewport: state.viewport,
      pageWidth: state.width,
      devicePixelRatio: state.devicePixelRatio,
      geometry: state.geometry,
    });
    await page.evaluate(() => {
      document.querySelectorAll(".product-map-scroll").forEach((element) => {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      });
      window.scrollTo(0, 0);
    });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect &&
              Number.isFinite(animation.effect.getComputedTiming().endTime),
          )
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    await page.screenshot({ path: evidence + name + ".png", fullPage: true });
  };
  const request = async (path, method = "GET", data) => {
    const res = await page.request.fetch(base + "/api" + path, {
      method,
      ...(data === undefined ? {} : { data }),
    });
    if (!res.ok()) throw Error(`${method} ${path} failed (${res.status()})`);
    return res.json();
  };
  await page.unrouteAll({ behavior: "wait" });
  await page.context().clearCookies();
  await request("/auth/login", "POST", {
    email: "design-organizer@example.invalid",
    password,
  });
  // A previously published closed performance, created through the real workflow.
  let mine = await request("/events/" + eventId + "/manage");
  let closed = mine.showtimes.find(
    (s) => s.startTime === "2026-10-18T12:30:00.000Z" && s.status === "CLOSED",
  );
  if (!closed) {
    closed = await request("/events/" + eventId + "/showtimes", "POST", {
      startTime: "2026-10-18T12:30:00Z",
    });
    await page.goto(base + "/showtimes/" + closed.id + "/import");
    await page.getByLabel("Tệp JSON").waitFor();
    await page
      .getByLabel("Tệp JSON")
      .setInputFiles(root + "/fixtures/seat-map-2000.json");
    await page.locator('canvas[data-rendered="2000"]').waitFor();
    await page.getByRole("button", { name: "Xác nhận nạp sơ đồ" }).click();
    await page.getByText("Đã nạp sơ đồ thành công.", { exact: true }).waitFor();
    const detail = await request("/showtimes/" + closed.id + "/manage");
    await request("/showtimes/" + closed.id + "/prices", "PATCH", {
      prices: detail.categories.map((c) => ({
        id: c.id,
        price:
          c.name === "VIP"
            ? 1200000
            : c.name === "Tiêu chuẩn"
              ? 650000
              : 350000,
      })),
    });
    await request("/showtimes/" + closed.id + "/status", "PATCH", {
      status: "ON_SALE",
    });
    await request("/showtimes/" + closed.id + "/status", "PATCH", {
      status: "CLOSED",
    });
  }
  await page.context().clearCookies();
  const posterSnapshots = [];
  for (const width of [1280, 390]) {
    await viewport(width);
    await page.goto(base);
    await page
      .getByRole("link", { name: "Xem chi tiết", exact: true })
      .first()
      .waitFor();
    verify(
      (await page
        .getByRole("link", { name: "Xem chi tiết", exact: true })
        .count()) === 6,
      "Six source-aligned live performances: " + width,
    );
    posterSnapshots.push(
      await page.locator(".catalog-row").evaluateAll((rows) =>
        rows.map((row) => ({
          id: row.querySelector("a").getAttribute("href"),
          src: row.querySelector("img").getAttribute("src"),
        })),
      ),
    );
    await shot("catalog-" + width);
    await page.goto(base + "/shows/" + publicId);
    await page.getByRole("link", { name: "Chọn ghế", exact: true }).waitFor();
    verify(
      !(await page
        .getByRole("button", { name: "Đã đóng bán", exact: true })
        .first()
        .isEnabled()),
      "Closed performance offers no selection: " + width,
    );
    await shot("detail-" + width);
    await page.getByRole("link", { name: "Chọn ghế", exact: true }).click();
    await page.waitForURL("**/login?returnTo=*");
    verify(
      new URL(page.url()).searchParams.get("returnTo") ===
        "/shows/" + publicId + "/seats",
      "Anonymous return destination is exact: " + width,
    );
    await shot("login-clean-" + width);
    await page
      .getByRole("textbox", { name: /^Email(?: \/ Tên đăng nhập)?$/ })
      .fill("design-buyer@example.invalid");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Incorrect-local-only-password");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page
      .getByText("Email hoặc mật khẩu không chính xác.", { exact: true })
      .waitFor();
    await shot("login-" + width);
  }
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("**/shows/" + publicId + "/seats");
  for (const width of [1280, 390, 360, 768]) {
    await viewport(width);
    await page.goto(base + "/shows/" + publicId + "/seats");
    await page.locator('canvas[data-rendered="2000"]').waitFor();
    await page.locator("canvas").press("Enter");
    verify(
      await page
        .getByRole("button", { name: "Giữ ghế", exact: true })
        .isEnabled(),
      "Draft ready for real hold; no confirmation until server: " + width,
    );
    await page.getByRole("button", { name: "Phóng to", exact: true }).click();
    await page
      .getByRole("button", { name: "Vừa màn hình", exact: true })
      .click();
    await page.locator("canvas").press("ArrowRight");
    await page.locator("canvas").press("Enter");
    await shot("draft-" + width);
  }
  await viewport(1280);
  const renderSamples = [];
  for (let i = 0; i < 30; i++) {
    await page.goto(base + "/shows/" + publicId + "/seats");
    await page.locator('canvas[data-rendered="2000"]').waitFor();
    renderSamples.push(
      await page.evaluate(
        () => performance.getEntriesByName("seat-map-rendered")[0].startTime,
      ),
    );
  }
  const renderP95 = [...renderSamples].sort((a, b) => a - b)[
    Math.ceil(renderSamples.length * 0.95) - 1
  ];
  verify(
    renderP95 < 2000,
    "2000-seat production navigation-to-painted-frame p95 below 2s",
  );
  await page.goto(base + "/showtimes/" + publicId + "/prices");
  await page.locator("[data-slot=alert]").waitFor();
  verify(
    (await page.getByLabel("VIP · VND").count()) === 0,
    "Buyer cannot operate organizer pricing",
  );
  await page.context().clearCookies();
  await page.goto(base + "/login");
  await page
    .getByRole("textbox", { name: /^Email(?: \/ Tên đăng nhập)?$/ })
    .fill("design-organizer@example.invalid");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("**/events");
  const draft = await request("/events/" + eventId + "/showtimes", "POST", {
    startTime: "2026-10-17T12:30:00Z",
  });
  const id = draft.id;
  await page.goto(base + "/showtimes/" + id + "/manage");
  await page
    .getByRole("heading", { name: "Kiểm tra điều kiện mở bán" })
    .waitFor();
  verify(
    !(await page
      .getByRole("button", { name: "Mở bán", exact: true })
      .isEnabled()),
    "No map cannot open sale",
  );
  for (const width of [1280, 390]) {
    await viewport(width);
    await page.goto(base + "/showtimes/" + id + "/import");
    await page.getByLabel("Tệp JSON").waitFor();
    if (width === 1280) {
      const validationPattern = "**/api/showtimes/validate-map";
      await page.route(validationPattern, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const response = await route.fetch();
        await route.fulfill({ response });
      });
      await page
        .getByLabel("Tệp JSON")
        .setInputFiles(root + "/fixtures/seat-map-2000.json");
      await page.getByText("Đang kiểm tra tệp…", { exact: true }).waitFor();
      await page.getByLabel("Tệp JSON").setInputFiles([]);
      await page
        .getByText("Đang kiểm tra tệp…", { exact: true })
        .waitFor({ state: "hidden" });
      await page.unrouteAll({ behavior: "wait" });
      await page.waitForTimeout(550);
      verify(
        (await page.locator("canvas").count()) === 0,
        "Clearing a file cancels validating state and rejects stale preview",
      );
      await page.getByLabel("Tệp JSON").setInputFiles({
        name: "too-large.json",
        mimeType: "application/json",
        buffer: Buffer.alloc(6 * 1024 * 1024, 32),
      });
      await page.getByText("Tệp vượt quá 5 MB.", { exact: true }).waitFor();
      verify(
        !(await page
          .getByRole("button", { name: "Xác nhận nạp sơ đồ" })
          .isEnabled()),
        "Oversized upload cannot write data and does not keep loading state",
      );
    }
    await page
      .getByLabel("Tệp JSON")
      .setInputFiles(root + "/fixtures/seat-map-invalid.json");
    await page.locator(".issue-table").waitFor();
    verify(
      !(await page
        .getByRole("button", { name: "Xác nhận nạp sơ đồ" })
        .isEnabled()),
      "All import errors prevent database write: " + width,
    );
    await shot("import-error-" + width);
    await page
      .getByLabel("Tệp JSON")
      .setInputFiles(root + "/fixtures/seat-map-2000.json");
    await page.locator('canvas[data-rendered="2000"]').waitFor();
    await page
      .getByRole("button", { name: "Vừa màn hình", exact: true })
      .click();
    verify(
      (await request("/showtimes/" + id + "/manage"))._count.seats === 0,
      "Valid preview writes zero seats: " + width,
    );
    await shot("import-" + width);
  }
  await page.getByRole("button", { name: "Xác nhận nạp sơ đồ" }).click();
  await page.getByText("Đã nạp sơ đồ thành công.", { exact: true }).waitFor();
  verify(
    (await request("/showtimes/" + id + "/manage"))._count.seats === 2000,
    "UI import persists all 2000 seats",
  );
  for (const width of [1280, 390]) {
    await viewport(width);
    await page.goto(base + "/showtimes/" + id + "/prices");
    await page.getByLabel("VIP · VND").waitFor();
    await page.getByLabel("VIP · VND").fill("-50000");
    await page.getByLabel("Tiêu chuẩn · VND").fill("");
    await page.getByLabel("Ban công · VND").fill("0");
    verify(
      !(await page
        .getByRole("button", { name: "Lưu giá", exact: true })
        .isEnabled()),
      "Missing and negative VND values cannot submit: " + width,
    );
    await shot("prices-error-" + width);
  }
  await page.getByLabel("VIP · VND").fill("1.200.000");
  await page.getByLabel("Tiêu chuẩn · VND").fill("650000");
  await page.getByLabel("Ban công · VND").fill("350000");
  await page.getByRole("button", { name: "Lưu giá", exact: true }).click();
  await page
    .getByText("Đã lưu giá. Sơ đồ đã cập nhật.", { exact: true })
    .waitFor();
  verify(
    (await request("/showtimes/" + id + "/manage")).categories.find(
      (c) => c.name === "VIP",
    ).price === 1200000,
    "VND formatting persists exact integer price",
  );
  for (const width of [1280, 390, 360, 768]) {
    await viewport(width);
    for (const mode of ["manage", "prices", "map"]) {
      await page.goto(base + "/showtimes/" + id + "/" + mode);
      if (mode === "map") {
        await page.locator('canvas[data-rendered="2000"]').waitFor();
        await page.locator("canvas").press("ArrowRight");
        await page.locator("canvas").press("Enter");
        await page
          .getByRole("button", { name: "Vừa màn hình", exact: true })
          .click();
        verify(
          (await page.locator("#seat-inspector").innerText()).includes(
            "1.200.000",
          ),
          "Inspector reflects saved price: " + width,
        );
        verify(
          (await request("/showtimes/" + id + "/manage")).status === "DRAFT",
          "Read-only inspection does not change state: " + width,
        );
      } else if (mode === "prices")
        await page.getByLabel("VIP · VND").waitFor();
      else
        await page
          .getByRole("heading", { name: "Kiểm tra điều kiện mở bán" })
          .waitFor();
      await shot(mode + "-" + width);
    }
  }
  await viewport(1280);
  await page.goto(base + "/showtimes/" + id + "/manage");
  await page.getByRole("button", { name: "Mở bán", exact: true }).click();
  await page.getByText("Đã mở bán.", { exact: true }).waitFor();
  verify(
    (await request("/showtimes/" + id + "/manage")).status === "ON_SALE",
    "Opening sale is persisted by real API",
  );
  const opened = await request("/showtimes");
  verify(
    opened.items.some((s) => s.id === id),
    "Public catalog cache invalidates after opening sale",
  );
  await page.getByRole("button", { name: "Đóng bán", exact: true }).click();
  await page.getByText("Đã đóng bán.", { exact: true }).waitFor();
  verify(
    (await page.request.get(base + "/api/showtimes/" + id)).status() === 404,
    "Closed public detail remains unavailable",
  );
  verify(
    !(await request("/showtimes")).items.some((s) => s.id === id),
    "Public catalog cache invalidates after closure",
  );
  await page.goto(base + "/showtimes/" + id + "/import");
  await page.getByLabel("Tệp JSON").waitFor();
  verify(
    !(await page.getByLabel("Tệp JSON").isEnabled()),
    "Previously sold structure cannot be re-imported",
  );
  const catalogPattern = "**/api/showtimes";
  await viewport(390);
  await page.route(catalogPattern, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto(base);
  await page.getByLabel("Đang tải danh sách").waitFor();
  await shot("loading-390");
  await page
    .getByRole("heading", { name: "Không tìm thấy sự kiện nào" })
    .waitFor();
  await shot("empty-390");
  verify(
    (await page
      .getByRole("link", { name: "Xem chi tiết", exact: true })
      .count()) === 0,
    "UI-only empty fixture does not fabricate products",
  );
  await page.unroute(catalogPattern);
  await page.route(catalogPattern, (route) => route.abort());
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Không tải được danh sách" })
    .waitFor();
  await shot("error-390");
  await page.unroute(catalogPattern);
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await page
    .getByRole("link", { name: "Xem chi tiết", exact: true })
    .first()
    .waitFor();
  verify(
    (await page
      .getByRole("link", { name: "Xem chi tiết", exact: true })
      .count()) === 6,
    "Retry recovers real six-event data",
  );
  await page.context().clearCookies();
  await request("/auth/login", "POST", {
    email: "design-buyer@example.invalid",
    password,
  });
  const seatPattern = "**/api/showtimes/" + publicId + "/seats";
  await page.route(seatPattern, async (route) => {
    const res = await route.fetch();
    const seats = await res.json();
    seats[0].status = "SOLD";
    seats[1].status = "HELD";
    await route.fulfill({ json: seats });
  });
  await page.goto(base + "/shows/" + publicId + "/seats");
  await page.locator('canvas[data-rendered="2000"]').waitFor();
  await page.locator("canvas").press("Enter");
  await page.locator("canvas").press("ArrowRight");
  await page.locator("canvas").press("Enter");
  verify(
    await page
      .getByText("Chạm vào ghế trống trên sơ đồ.", { exact: true })
      .isVisible(),
    "UI-only SOLD/HELD fixtures cannot be selected",
  );
  await page.unroute(seatPattern);
  verify(errors.length === 0, "No JavaScript runtime errors");
  await page.goto(base);
  await page
    .getByRole("link", { name: "Xem chi tiết", exact: true })
    .first()
    .waitFor();
  return {
    date: new Date().toISOString(),
    mode: "Production Next standalone and Nest; real local PostgreSQL/Redis; Chrome emulation",
    checks,
    screenChecks,
    renderSamples,
    renderP95,
    errors,
    consoleMessages,
    errorResponses,
    posterSnapshots,
    showtimeId: id,
    closedShowtimeId: closed.id,
    uiOnlyFixtures: [
      "loading",
      "empty",
      "network-error",
      "SOLD/HELD selection exclusion",
    ],
    holdIntegrated: true,
    staging: false,
  };
};
