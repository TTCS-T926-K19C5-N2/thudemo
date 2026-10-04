import { describe, expect, it } from "vitest";
import { countdownLabel, remainingSeconds } from "./server-countdown";
import { decodeHoldState } from "@/lib/contracts/holds";
describe("Server countdown", () => {
  const expiry = "2026-10-04T12:10:00.000Z";
  const clock = {
    serverMs: Date.parse("2026-10-04T12:00:00.000Z"),
    receivedAt: 50,
  };
  it("uses elapsed monotonic time and clamps expiry", () => {
    expect(remainingSeconds(expiry, clock, 50)).toBe(600);
    expect(remainingSeconds(expiry, clock, 60050)).toBe(540);
    expect(remainingSeconds(expiry, clock, 700050)).toBe(0);
    expect(countdownLabel(540)).toBe("09:00");
  });
  it("reconnect/reload uses the original deadline, no new ten minutes", () => {
    expect(
      remainingSeconds(
        expiry,
        { serverMs: Date.parse("2026-10-04T12:06:00Z"), receivedAt: 500 },
        500,
      ),
    ).toBe(240);
  });
  it("rejects malformed ownership/clock rather than showing fake success", () => {
    expect(() =>
      decodeHoldState({ serverTime: "invalid", hold: null }),
    ).toThrow();
    expect(() =>
      decodeHoldState({
        serverTime: "2026-10-04T12:00:00Z",
        hold: { id: "hold", expiresAt: expiry, seatIds: [] },
      }),
    ).toThrow();
  });
});
