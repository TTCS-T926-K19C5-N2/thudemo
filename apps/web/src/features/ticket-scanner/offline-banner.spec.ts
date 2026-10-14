import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfflineBanner } from "./offline-banner";

describe("OfflineBanner", () => {
  it("shows the offline warning as an overlay without changing its test locator", () => {
    const markup = renderToStaticMarkup(
      createElement(OfflineBanner, {
        isOnline: false,
        pendingCount: 2,
        isSyncing: false,
      }),
    );

    expect(markup).toContain('data-testid="offline-status-banner"');
    expect(markup).toContain(
      'class="fixed inset-x-4 top-20 z-50 mx-auto max-w-3xl',
    );
    expect(markup).toContain("ĐANG NGOẠI TUYẾN — 2 lượt quét chưa đồng bộ");
  });

  it("keeps unconfirmed scans visible when online but not syncing", () => {
    const markup = renderToStaticMarkup(
      createElement(OfflineBanner, {
        isOnline: true,
        pendingCount: 2,
        isSyncing: false,
        onRetrySync: () => {},
      }),
    );

    expect(markup).toContain('data-testid="pending-sync-status-banner"');
    expect(markup).toContain("CÒN 2 lượt quét chưa đồng bộ");
    expect(markup).toContain("Thử kết nối lại");
  });

  it("hides the warning after all scans are synchronized", () => {
    const markup = renderToStaticMarkup(
      createElement(OfflineBanner, {
        isOnline: true,
        pendingCount: 0,
        isSyncing: false,
      }),
    );

    expect(markup).toBe("");
  });
});
