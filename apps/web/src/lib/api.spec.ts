import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./api";
describe("Login return path allowlist", () => {
  it("restores only deliberate local event/seat/order destinations", () => {
    for (const path of [
      "/events/new",
      "/orders",
      "/orders?page=2",
      "/account/tickets",
      "/account/tickets?page=2",
      "/events/12345678-1234-1234-1234-123456789abc",
      "/shows/12345678-1234-1234-1234-123456789abc/seats",
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
      "/events/not-uuid",
      "/events/%6eew",
      "/account/tickets?next=https://attacker.invalid",
      "/account/tickets?page=0",
    ])
      expect(safeReturnTo(path)).toBeNull();
  });
});
