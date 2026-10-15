import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, object } from "./client";
import { decodeCatalog, decodeSeats, posterPath } from "../contracts/showtimes";
import { decodeCurrentUser, safeReturnTo } from "../api";
import { parseVndInput } from "../formatting";
import { seatCategoryToken } from "../presentation/seat-category";
afterEach(() => vi.unstubAllGlobals());
describe("HTTP and presentation contracts", () => {
  it("keeps category colors stable when server order changes", () => {
    const names = ["Ban công", "Tiêu chuẩn", "VIP"];
    expect(names.map(seatCategoryToken)).toEqual([
      "--seat-balcony",
      "--seat-standard",
      "--seat-vip",
    ]);
    expect(names.toReversed().map(seatCategoryToken)).toEqual([
      "--seat-vip",
      "--seat-standard",
      "--seat-balcony",
    ]);
  });
  it("preserves status, field errors and conflict details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "CONFLICT",
            message: "Không thể mở bán.",
            errors: { price: "Thiếu giá" },
            conflictingSeatIds: ["seat-a"],
            retryAfterSeconds: 30,
          }),
          { status: 409 },
        ),
      ),
    );
    try {
      await api("/showtimes/id/status", object);
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 409,
        code: "CONFLICT",
        details: {
          errors: { price: "Thiếu giá" },
          conflictingSeatIds: ["seat-a"],
          retryAfterSeconds: 30,
        },
      });
    }
  });
  it("retains HTTP status when an error body is not an object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("[]", { status: 403 })),
    );
    await expect(api("/restricted", object)).rejects.toMatchObject({
      status: 403,
      code: "HTTP_403",
    });
  });
  it("does not claim success on malformed or invented responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"items":[{"id":"invented"}],"nextCursor":null}'),
        ),
    );
    await expect(api("/showtimes", decodeCatalog)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(() =>
      decodeCurrentUser({ id: "id", email: "a", roles: [1] }),
    ).toThrow(ApiError);
    expect(() =>
      decodeSeats([
        {
          id: "a",
          row: "A",
          seatNumber: 1,
          category: "VIP",
          price: 0,
          status: "FAKE",
        },
      ]),
    ).toThrow(ApiError);
  });
  it("localizes network failure and retains cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(api("/showtimes", object)).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError")),
    );
    await expect(api("/showtimes", object)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
  it("rejects external or traversal poster URLs; allows absent images", () => {
    expect(posterPath("/images/events/autumn-symphony.jpg")).toBe(
      "/images/events/autumn-symphony.jpg",
    );
    expect(posterPath("https://external.invalid/a.jpg")).toBeNull();
    expect(posterPath("/images/events/../a.jpg")).toBeNull();
    expect(posterPath(null)).toBeNull();
  });
  it("parses VND without turning fractions or malformed grouping into another price", () => {
    expect(parseVndInput("1.200.000")).toBe(1200000);
    expect(parseVndInput("1200000")).toBe(1200000);
    expect(parseVndInput("0")).toBe(0);
    for (const value of ["", "-1", "1.2", "1,2", "12.00", "1e6", "2147483648"])
      expect(parseVndInput(value)).toBeNull();
  });
  it("only accepts a same-origin showtime selection return destination", () => {
    const path = "/shows/c0100401-0000-4000-8000-000000000001/seats";
    expect(safeReturnTo(path)).toBe(path);
    expect(safeReturnTo("//external.invalid")).toBeNull();
    expect(safeReturnTo("/events")).toBeNull();
  });
});
