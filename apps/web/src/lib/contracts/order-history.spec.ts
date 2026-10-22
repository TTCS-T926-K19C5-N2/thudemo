import { describe, expect, it } from "vitest";
import {
  decodeOrderHistory,
  decodeOrderDetail,
  historyPage,
} from "./order-history";
import { safeReturnTo } from "../api";

const summary = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "DH-1",
  createdAt: "2026-10-07T00:00:00Z",
  status: "CANCELLED",
  paymentExpiresAt: "2026-10-07T00:10:00Z",
  totalAmount: 500000,
  seatCount: 1,
  showtime: {
    id: "show-1",
    startTime: "2026-10-10T12:00:00Z",
    event: { id: "event-1", name: "Hòa nhạc", location: "Nhà hát" },
  },
};
const response = {
  serverTime: "2026-10-07T12:00:00Z",
  orders: [summary],
  pagination: {
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
  },
};

describe("history boundary and safe login continuation", () => {
  it("preserves cancelled and expired statuses in real contracts", () => {
    expect(decodeOrderHistory(response).orders[0].status).toBe("CANCELLED");
    expect(
      decodeOrderHistory({
        ...response,
        orders: [{ ...summary, status: "EXPIRED" }],
      }).orders[0].status,
    ).toBe("EXPIRED");
  });
  it("rejects malformed money, timestamps, pagination and detail seat counts", () => {
    expect(() =>
      decodeOrderHistory({
        ...response,
        orders: [{ ...summary, totalAmount: "500000" }],
      }),
    ).toThrow();
    expect(() =>
      decodeOrderHistory({
        ...response,
        orders: [{ ...summary, createdAt: "not-a-time" }],
      }),
    ).toThrow();
    expect(() =>
      decodeOrderHistory({
        ...response,
        pagination: { ...response.pagination, totalPages: 99 },
      }),
    ).toThrow();
    const detail = {
      serverTime: response.serverTime,
      created: false,
      order: {
        ...summary,
        seatCount: 2,
        items: [
          {
            seatId: "seat-1",
            categoryName: "VIP",
            unitPrice: 500000,
            seat: { row: "A", seatNumber: 1 },
          },
        ],
      },
    };
    expect(() => decodeOrderDetail(detail)).toThrow();
  });
  it("validates direct page URLs without accepting arrays or overflowing the database", () => {
    expect(historyPage(undefined)).toBe(1);
    expect(historyPage("2")).toBe(2);
    for (const value of ["0", "-1", "1.5", "abc", "9999999999", ["1", "2"]])
      expect(historyPage(value)).toBeNull();
  });
  it("allows only known local order/seat destinations and preserves the current page", () => {
    expect(safeReturnTo("/orders?page=2")).toBe("/orders?page=2");
    expect(safeReturnTo(`/orders/${summary.id}?page=2`)).toBe(
      `/orders/${summary.id}?page=2`,
    );
    for (const path of [
      "https://evil.invalid/orders",
      "//evil.invalid",
      "/orders?next=https://evil.invalid",
      "/orders/../../account",
      "/orders?userId=1",
      "/orders?page=0",
    ])
      expect(safeReturnTo(path)).toBeNull();
  });
});
