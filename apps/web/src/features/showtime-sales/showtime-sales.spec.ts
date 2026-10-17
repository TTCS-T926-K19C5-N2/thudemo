import { describe, expect, it } from "vitest";
import { decodeShowtimeSales } from "@/lib/contracts/showtimes";
import { SALES_REFRESH_MS, soldShare } from "./showtime-sales";

const figures = { totalSeats: 5, sold: 2, held: 1, available: 2, revenue: 950000 };
const payload = {
  showtimeId: "44444444-4444-4444-8444-444444444444",
  generatedAt: "2026-10-12T08:00:00.000Z",
  totals: figures,
  categories: [{ name: "VIP", price: 500000, ...figures }],
};

describe("decodeShowtimeSales", () => {
  it("decodes totals and per-category figures", () => {
    expect(decodeShowtimeSales(payload)).toEqual(payload);
  });

  it("accepts a category without a price yet", () => {
    const sales = decodeShowtimeSales({
      ...payload,
      categories: [{ ...payload.categories[0], price: null }],
    });
    expect(sales.categories[0].price).toBeNull();
  });

  it("rejects negative, fractional or missing figures", () => {
    expect(() => decodeShowtimeSales({ ...payload, totals: { ...figures, sold: -1 } })).toThrow();
    expect(() => decodeShowtimeSales({ ...payload, totals: { ...figures, revenue: 1.5 } })).toThrow();
    expect(() =>
      decodeShowtimeSales({ ...payload, categories: [{ name: "VIP", price: 1 }] }),
    ).toThrow();
    expect(() => decodeShowtimeSales({ ...payload, generatedAt: "not a date" })).toThrow();
  });
});

describe("sales report", () => {
  it("refreshes within the one-minute freshness requirement", () => {
    expect(SALES_REFRESH_MS).toBeLessThanOrEqual(60_000);
  });

  it("shows the sold share, and 0% for a showtime without seats", () => {
    expect(soldShare(figures)).toBe("40%");
    expect(soldShare({ ...figures, totalSeats: 0, sold: 0 })).toBe("0%");
  });
});
