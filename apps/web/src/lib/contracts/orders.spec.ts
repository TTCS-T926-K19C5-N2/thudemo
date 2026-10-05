import { describe, expect, it } from "vitest";
import { decodeOrderResponse } from "./orders";

const response = {
  created: true,
  serverTime: "2026-10-05T08:00:00.000Z",
  order: {
    id: "order-1",
    status: "PENDING_PAYMENT",
    totalAmount: "1500000",
    paymentExpiresAt: "2026-10-05T08:15:00.000Z",
    createdAt: "2026-10-05T08:00:00.000Z",
    showtime: {
      id: "show-1",
      startTime: "2026-10-10T12:00:00.000Z",
      event: { name: "Đêm nhạc", location: "Nhà hát" },
    },
    items: [
      {
        seatId: "seat-1",
        row: "A",
        seatNumber: 1,
        categoryName: "VIP",
        unitPrice: 1000000,
      },
      {
        seatId: "seat-2",
        row: "B",
        seatNumber: 2,
        categoryName: "Standard",
        unitPrice: 500000,
      },
    ],
  },
};

describe("decodeOrderResponse", () => {
  it("decodes a server-priced pending order", () => {
    expect(decodeOrderResponse(response).order.totalAmount).toBe("1500000");
  });

  it("rejects a total that does not match item price snapshots", () => {
    expect(() =>
      decodeOrderResponse({
        ...response,
        order: { ...response.order, totalAmount: "1" },
      }),
    ).toThrow("Không đọc được thông tin đơn hàng");
  });

  it("rejects unknown order statuses", () => {
    expect(() =>
      decodeOrderResponse({
        ...response,
        order: { ...response.order, status: "PAID" },
      }),
    ).toThrow("Không đọc được thông tin đơn hàng");
  });
});

