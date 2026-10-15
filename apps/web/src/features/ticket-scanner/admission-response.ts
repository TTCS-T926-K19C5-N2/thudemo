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
