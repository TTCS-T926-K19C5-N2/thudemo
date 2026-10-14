import { ApiError, object } from "@/lib/api/client";
export type CheckInResult = {
  status: "SUCCESS" | "EXCEPTION_RECORDED" | "ALREADY_RECORDED";
  ticketId: string;
  gateName: string;
  kind: string;
  seat: { category: string; row: string; number: number; label: string };
  checkedInAt: string;
};
export type UsedTicket = {
  checkedInAt: string;
  gateName: string;
  canOverride: boolean;
};
export function decodeCheckIn(value: unknown): CheckInResult {
  const response = object(value);
  const seat = object(response.seat);
  if (
    !["SUCCESS", "EXCEPTION_RECORDED", "ALREADY_RECORDED"].includes(
      String(response.status),
    ) ||
    typeof response.ticketId !== "string" ||
    typeof response.gateName !== "string" ||
    !["NORMAL", "EXCEPTION"].includes(String(response.kind)) ||
    typeof seat.category !== "string" ||
    typeof seat.row !== "string" ||
    typeof seat.number !== "number" ||
    typeof seat.label !== "string" ||
    typeof response.checkedInAt !== "string" ||
    !Number.isFinite(Date.parse(response.checkedInAt))
  )
    throw new ApiError(
      "Phản hồi không hợp lệ. Hãy kiểm tra kết quả rồi thử lại.",
      502,
      "INVALID_RESPONSE",
    );
  return {
    status: response.status as CheckInResult["status"],
    ticketId: response.ticketId,
    gateName: response.gateName,
    kind: response.kind as string,
    seat: {
      category: seat.category,
      row: seat.row,
      number: seat.number,
      label: seat.label,
    },
    checkedInAt: response.checkedInAt,
  };
}
export function usedTicket(error: unknown): UsedTicket | null {
  if (
    !(error instanceof ApiError) ||
    error.code !== "TICKET_ALREADY_CHECKED_IN"
  )
    return null;
  const value = error.details.firstAdmission;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const first = value as Record<string, unknown>;
  if (
    typeof first.checkedInAt !== "string" ||
    !Number.isFinite(Date.parse(first.checkedInAt)) ||
    typeof first.gateName !== "string"
  )
    return null;
  return {
    checkedInAt: first.checkedInAt,
    gateName: first.gateName,
    canOverride: error.details.canOverride === true,
  };
}
export function admissionTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export type ScanRejection = {
  reasonCode:
    | "ERR_TICKET_WRONG_SHOWTIME"
    | "ERR_TICKET_CANCELLED"
    | "ERR_TICKET_UNKNOWN"
    | "ERR_TICKET_NOT_ELIGIBLE";
  title: string;
  detail: string;
};

const validDate = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));

export function scanRejection(error: unknown): ScanRejection | null {
  if (!(error instanceof ApiError)) return null;
  const d = error.details;
  const reasonCode = d.reasonCode;
  switch (reasonCode) {
    case "ERR_TICKET_WRONG_SHOWTIME": {
      const s = d.ticketShowtime as Record<string, unknown> | undefined;
      if (!s || typeof s.eventName !== "string" || !validDate(s.startTime)) {
        return {
          reasonCode: "ERR_TICKET_WRONG_SHOWTIME",
          title: "Sai suất diễn",
          detail: error.message || "Vé không thuộc suất đang soát.",
        };
      }
      return {
        reasonCode: "ERR_TICKET_WRONG_SHOWTIME",
        title: "Sai suất diễn",
        detail: `Vé của suất ${s.eventName} lúc ${admissionTime(s.startTime)}.`,
      };
    }
    case "ERR_TICKET_CANCELLED": {
      return {
        reasonCode: "ERR_TICKET_CANCELLED",
        title: "Vé đã huỷ",
        detail: validDate(d.cancelledAt)
          ? `Vé đã huỷ ngày ${new Date(d.cancelledAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`
          : "Vé đã huỷ.",
      };
    }
    case "ERR_TICKET_UNKNOWN": {
      return {
        reasonCode: "ERR_TICKET_UNKNOWN",
        title: "Mã QR không hợp lệ",
        detail: "Không phải vé của hệ thống.",
      };
    }
    case "ERR_TICKET_NOT_ELIGIBLE": {
      return {
        reasonCode: "ERR_TICKET_NOT_ELIGIBLE",
        title: "Chưa đủ điều kiện",
        detail: error.message || "Vé chưa đủ điều kiện vào.",
      };
    }
    default:
      return null;
  }
}
