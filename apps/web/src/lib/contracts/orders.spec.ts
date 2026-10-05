import { describe, expect, it } from "vitest";
import { decodeOrder, decodePendingOrder } from "./orders";

const response = {
  serverTime: "2026-10-05T12:00:00.000Z",
  created: true,
  order: {
    id: "order-1",
    status: "PENDING_PAYMENT",
    paymentExpiresAt: "2026-10-05T12:10:00.000Z",
    totalAmount: 500000,
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

describe("pending order contract", () => {
  it("decodes the server-priced order", () => {
    expect(decodePendingOrder(response)).toMatchObject({
      created: true,
      order: {
        totalAmount: 500000,
        items: [{ row: "A", seatNumber: 1, unitPrice: 500000 }],
      },
    });
  });

  it("rejects malformed money and duplicate seats", () => {
    expect(() =>
      decodePendingOrder({
        ...response,
        order: { ...response.order, totalAmount: "500000" },
      }),
    ).toThrow();
    expect(() =>
      decodePendingOrder({
        ...response,
        order: {
          ...response.order,
          items: [response.order.items[0], response.order.items[0]],
        },
      }),
    ).toThrow();
  });

  it("accepts an expired status for the owned-order screen only", () => {
    const expired = {
      ...response,
      order: { ...response.order, status: "EXPIRED" },
    };
    expect(decodeOrder(expired).order.status).toBe("EXPIRED");
    expect(() => decodePendingOrder(expired)).toThrow();
  });
});
