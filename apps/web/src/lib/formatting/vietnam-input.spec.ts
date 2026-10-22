import { describe, expect, it } from "vitest";
import { vietnamInputFromUtc, vietnamInputToUtc } from "./vietnam-input";
describe("Vietnam organizer datetime input", () => {
  it("preserves midnight and date over UTC round trips independent of host timezone", () => {
    const utc = vietnamInputToUtc("2026-12-01T00:30");
    expect(utc).toBe("2026-11-30T17:30:00.000Z");
    expect(vietnamInputFromUtc(new Date(utc!))).toBe("2026-12-01T00:30");
  });
  it("rejects missing or malformed input", () => {
    expect(vietnamInputToUtc("")).toBeNull();
    expect(vietnamInputToUtc("2026-12-01T00:30Z")).toBeNull();
    expect(vietnamInputToUtc("2026-02-30T00:30")).toBeNull();
    expect(vietnamInputToUtc("2026-13-01T00:30")).toBeNull();
  });
});
