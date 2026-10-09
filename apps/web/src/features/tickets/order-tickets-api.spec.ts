import { describe, expect, it } from "vitest";
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
