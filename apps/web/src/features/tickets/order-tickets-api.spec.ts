import { describe, expect, it, vi } from "vitest";
import { decodeOrderTickets } from "./order-tickets-api";

const ticket = {
  id: "t1",
  code: "AbCdEfGhIjKlMnOpQrStUv",
  seatId: "s1",
  seatLabel: "A-1",
  ticketType: "VIP",
  status: "VALID",
  qrPayload: "v1.k1.AbCdEfGhIjKlMnOpQrStUv.44444444-4444-4444-8444-444444444444.sig",
};

describe("decodeOrderTickets", () => {
  it("decodes tickets, keeping a missing QR as null", () => {
    expect(
      decodeOrderTickets({ tickets: [ticket, { ...ticket, id: "t2", qrPayload: null }] }),
    ).toEqual([
      {
        id: "t1",
        code: ticket.code,
        seatLabel: "A-1",
        ticketType: "VIP",
        status: "VALID",
        transferredToEmail: null,
        qrPayload: ticket.qrPayload,
      },
      expect.objectContaining({ id: "t2", qrPayload: null, transferredToEmail: null }),
    ]);
  });

  it("returns an empty list for an order that is not paid", () => {
    expect(decodeOrderTickets({ tickets: [] })).toEqual([]);
  });

  it("rejects malformed responses", () => {
    expect(() => decodeOrderTickets({})).toThrow("Không đọc được dữ liệu vé.");
    expect(() => decodeOrderTickets({ tickets: [{ ...ticket, status: "USED" }] })).toThrow();
    expect(() => decodeOrderTickets({ tickets: [{ ...ticket, id: 1 }] })).toThrow();
  });
});

describe("cancelTicket", () => {
  it("calls POST on /orders/:id/tickets/:ticketId/cancel", async () => {
    const { cancelTicket } = await import("./order-tickets-api");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelTicket("order-123", "ticket-456");
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders/order-123/tickets/ticket-456/cancel",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

