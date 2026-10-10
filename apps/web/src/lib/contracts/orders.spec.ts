import { describe, expect, it } from "vitest";
import {
  decodeOrder,
  decodePendingOrder,
  decodeResendResponse,
  decodeOrdersList,
} from "./orders";

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

describe("S-27 email and QR ticket contracts", () => {
  it("decodes resend response correctly", () => {
    const resendPayload = {
      success: true,
      order: { id: "order-123" },
      emailResult: {
        success: true,
        attempts: 1,
        sentAt: "2026-10-10T00:00:00.000Z",
      },
    };
    const decoded = decodeResendResponse(resendPayload);
    expect(decoded.success).toBe(true);
    expect(decoded.emailResult.attempts).toBe(1);
    expect(decoded.emailResult.success).toBe(true);
  });

  it("decodes buyer orders list safely", () => {
    const list = [
      {
        id: "order-1",
        userId: "user-1",
        showtimeId: "showtime-1",
        totalAmount: 500000,
        status: "PAID",
        customerEmail: "buyer@example.com",
        createdAt: "2026-10-10T00:00:00.000Z",
        showtime: {
          id: "showtime-1",
          startTime: "2026-10-20T19:00:00.000Z",
          event: {
            name: "Hòa nhạc",
            location: "Nhà hát Lớn",
          },
        },
        tickets: [
          {
            id: "ticket-1",
            ticketCode: "TKT-123",
            seatId: "seat-1",
            price: 500000,
            qrCodeData: "QR-DATA-123",
            qrCodeImage: "data:image/png;base64,sample",
            seat: {
              row: "A",
              seatNumber: 1,
              category: { name: "VIP" },
            },
          },
        ],
      },
    ];
    const decoded = decodeOrdersList(list);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].tickets[0].ticketCode).toBe("TKT-123");
  });

  it("throws ApiError if orders list is not an array", () => {
    expect(() => decodeOrdersList({ invalid: true })).toThrow();
  });
});
