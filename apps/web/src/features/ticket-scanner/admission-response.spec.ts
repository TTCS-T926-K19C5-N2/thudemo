import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  admissionTime,
  decodeCheckIn,
  scanRejection,
  usedTicket,
} from "./admission-response";
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
  it("parses S-39 detailed ticket rejection reasons with localized formatting", () => {
    // 1. Wrong showtime
    const wrong = scanRejection(
      new ApiError("Vé không thuộc suất", 400, "WRONG_SHOWTIME", {
        reasonCode: "ERR_TICKET_WRONG_SHOWTIME",
        ticketShowtime: {
          eventName: "Đêm Nhạc Trịnh",
          startTime: "2026-12-25T13:00:00.000Z",
        },
      }),
    );
    expect(wrong).toEqual({
      reasonCode: "ERR_TICKET_WRONG_SHOWTIME",
      title: "Sai suất diễn",
      detail: "Vé của suất Đêm Nhạc Trịnh lúc 20:00:00 25/12/2026.",
    });

    // 2. Cancelled with date
    const cancelledWithDate = scanRejection(
      new ApiError("Vé đã huỷ", 404, "INVALID_TICKET", {
        reasonCode: "ERR_TICKET_CANCELLED",
        cancelledAt: "2026-11-20T10:00:00.000Z",
      }),
    );
    expect(cancelledWithDate).toEqual({
      reasonCode: "ERR_TICKET_CANCELLED",
      title: "Vé đã huỷ",
      detail: "Vé đã huỷ ngày 20/11/2026.",
    });

    // 3. Cancelled without date (null)
    const cancelledNoDate = scanRejection(
      new ApiError("Vé đã huỷ", 404, "INVALID_TICKET", {
        reasonCode: "ERR_TICKET_CANCELLED",
        cancelledAt: null,
      }),
    );
    expect(cancelledNoDate).toEqual({
      reasonCode: "ERR_TICKET_CANCELLED",
      title: "Vé đã huỷ",
      detail: "Vé đã huỷ.",
    });

    // 4. Unknown ticket
    const unknown = scanRejection(
      new ApiError("Mã lạ", 400, "INVALID_QR_SIGNATURE", {
        reasonCode: "ERR_TICKET_UNKNOWN",
      }),
    );
    expect(unknown).toEqual({
      reasonCode: "ERR_TICKET_UNKNOWN",
      title: "Mã QR không hợp lệ",
      detail: "Không phải vé của hệ thống.",
    });

    // 5. Not eligible
    const notEligible = scanRejection(
      new ApiError("Vé chưa hoàn tất thanh toán", 404, "INVALID_TICKET", {
        reasonCode: "ERR_TICKET_NOT_ELIGIBLE",
      }),
    );
    expect(notEligible).toEqual({
      reasonCode: "ERR_TICKET_NOT_ELIGIBLE",
      title: "Chưa đủ điều kiện",
      detail: "Vé chưa hoàn tất thanh toán",
    });

    // 6. Generic/unrelated error
    expect(scanRejection(new ApiError("Lỗi khác", 500, "INTERNAL"))).toBeNull();
    expect(scanRejection(new Error("Network error"))).toBeNull();
  });
});
