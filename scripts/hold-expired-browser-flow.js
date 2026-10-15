async (page) => {
  const root = __TASK_ROOT__,
    checks = [],
    screens = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await page.locator('canvas[data-rendered="2000"]').waitFor();
  await page.getByText("Máy chủ đã xác nhận", { exact: true }).waitFor();
  await page
    .getByText("Thời gian giữ ghế đã hết", { exact: true })
    .waitFor({ timeout: 15000 });
  checks.push(
    "Real DB fixture deadline reaches zero and automatically refreshes map",
  );
  const state = await page.evaluate(async () => {
    const path = location.pathname
      .replace("/shows/", "/api/showtimes/")
      .replace("/seats", "/holds");
    return (await fetch(path)).json();
  });
  if (state.hold !== null) throw Error("Expired ownership remains");
  checks.push("Authenticated server confirms no active hold");
  for (const width of [1280, 390, 360]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    const snapshot = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      text: document.body.innerText,
    }));
    if (snapshot.width > width || !snapshot.text.includes("00:00"))
      throw Error("Expired layout/time invalid");
    await page.screenshot({
      path: root + __CAPTURE_DIRECTORY__ + "expired-" + width + ".png",
      fullPage: true,
    });
    screens.push({ name: "expired-" + width, width });
  }
  await page.getByRole("button", { name: "Chọn lại ghế", exact: true }).click();
  await page.locator("canvas").press("Enter");
  if (
    !(await page
      .getByRole("button", { name: "Giữ ghế", exact: true })
      .isEnabled())
  )
    throw Error("Cannot select after expiry");
  checks.push("Expired rights become selectable again");
  return {
    checks,
    screens,
    errors,
    local: true,
    staging: false,
    fixture: "DB deadline only; production TTL unchanged",
  };
};
