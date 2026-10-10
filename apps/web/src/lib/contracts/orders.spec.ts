import { describe, it, expect } from "vitest";
import {
  decodeCheckoutResponse,
  decodeResendResponse,
  decodeOrdersList,
  decodeOrderDetail,
} from "./orders";

describe("orders contracts", () => {
  const sampleOrder = {
    id: "ord-1",
    userId: "usr-1",
    showtimeId: "st-1",
    totalAmount: 250000,
    status: "PAID",
    customerEmail: "buyer@example.com",
    createdAt: "2026-10-06T00:00:00.000Z",
    showtime: {
      id: "st-1",
      startTime: "2026-10-10T19:00:00.000Z",
      event: {
        name: "Concert A",
        location: "Hanoi",
      },
    },
    tickets: [
      {
        id: "tkt-1",
        ticketCode: "TKT-A1",
        seatId: "seat-1",
        price: 250000,
        qrCodeData: '{"ticketCode":"TKT-A1"}',
        qrCodeImage: "data:image/png;base64,sample",
        seat: {
          row: "A",
          seatNumber: 1,
          category: { name: "VIP" },
        },
      },
    ],
  };

  const sampleEmailResult = {
    success: true,
    attempts: 1,
  };

  it("decodes checkout response properly", () => {
    const raw = {
      order: sampleOrder,
      emailResult: sampleEmailResult,
    };
    const decoded = decodeCheckoutResponse(raw);
    expect(decoded.order.id).toBe("ord-1");
    expect(decoded.emailResult.success).toBe(true);
    expect(decoded.order.tickets).toHaveLength(1);
    expect(decoded.order.tickets[0].ticketCode).toBe("TKT-A1");
  });

  it("decodes resend response properly", () => {
    const raw = {
      success: true,
      order: sampleOrder,
      emailResult: sampleEmailResult,
    };
    const decoded = decodeResendResponse(raw);
    expect(decoded.success).toBe(true);
    expect(decoded.order.id).toBe("ord-1");
    expect(decoded.emailResult.attempts).toBe(1);
  });

  it("decodes orders list", () => {
    const raw = [sampleOrder];
    const decoded = decodeOrdersList(raw);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].id).toBe("ord-1");
  });

  it("throws error when orders list is not an array", () => {
    expect(() => decodeOrdersList({ invalid: true })).toThrow();
  });

  it("decodes order detail", () => {
    const decoded = decodeOrderDetail(sampleOrder);
    expect(decoded.id).toBe("ord-1");
  });
});
