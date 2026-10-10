import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { admissionTime, decodeCheckIn, usedTicket } from "./admission-response";
const result = {
  status: "SUCCESS",
  ticketId: "ticket",
  gateName: "A",
  kind: "NORMAL",
  seat: { category: "VIP", row: "A", number: 1, label: "A-1" },
  checkedInAt: "2026-12-25T12:02:00.000Z",
};
describe("Admission response semantics", () => {
  it("keeps retry and exception distinct from a first admission", () => {
    expect(
      decodeCheckIn({ ...result, status: "ALREADY_RECORDED" }).status,
    ).toBe("ALREADY_RECORDED");
    expect(
      decodeCheckIn({
        ...result,
        kind: "EXCEPTION",
        status: "EXCEPTION_RECORDED",
      }).status,
    ).toBe("EXCEPTION_RECORDED");
  });
  it("rejects corrupt success data instead of displaying valid", () => {
    expect(() => decodeCheckIn({ ...result, checkedInAt: "bad" })).toThrow();
    expect(() => decodeCheckIn({ ...result, gateName: undefined })).toThrow();
  });
  it("does not crash on malformed error metadata or infer permission", () => {
    expect(
      usedTicket(new ApiError("Used", 409, "TICKET_ALREADY_CHECKED_IN")),
    ).toBeNull();
    expect(
      usedTicket(
        new ApiError("Used", 409, "TICKET_ALREADY_CHECKED_IN", {
          firstAdmission: { checkedInAt: result.checkedInAt, gateName: "A" },
          canOverride: "true",
        }),
      )?.canOverride,
    ).toBe(false);
    expect(
      usedTicket(
        new ApiError("Denied", 403, "SHOWTIME_ACCESS_DENIED", {
          firstAdmission: result,
        }),
      ),
    ).toBeNull();
  });
  it("uses Vietnam time regardless of scanner operating system time zone", () => {
    expect(admissionTime(result.checkedInAt)).toContain("19:02:00");
  });
});
