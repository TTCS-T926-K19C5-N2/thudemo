import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./api";
describe("Login return path allowlist", () => {
  it("restores only deliberate local event/seat destinations", () => {
    for (const path of [
      "/events/new",
      "/events/12345678-1234-1234-1234-123456789abc",
      "/shows/12345678-1234-1234-1234-123456789abc/seats",
      "/orders",
      "/account/tickets",
    ])
      expect(safeReturnTo(path)).toBe(path);
    for (const path of [
      null,
      "",
      "//attacker.invalid",
      "https://attacker.invalid",
      "/events/new?next=https://attacker.invalid",
      "/events/../account",
      "/events/new#x",
      "/admin",
      "/events/not-uuid",
      "/events/%6eew",
    ])
      expect(safeReturnTo(path)).toBeNull();
  });
});
