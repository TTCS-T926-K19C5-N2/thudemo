import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfflineBanner } from "./offline-banner";

describe("OfflineBanner", () => {
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
