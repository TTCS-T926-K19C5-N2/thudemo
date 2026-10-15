import { ApiError, object } from "@/lib/api/client";
export type HoldState = {
  serverTime: string;
  hold: { id: string; expiresAt: string; seatIds: string[] } | null;
};
const invalid = (): never => {
  throw new ApiError(
    "Không đọc được trạng thái giữ ghế. Hãy tải lại.",
    502,
    "INVALID_RESPONSE",
  );
};
const time = (value: unknown): string =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : invalid();
export function decodeHoldState(value: unknown): HoldState {
  const state = object(value);
  if (state.hold === null)
    return { serverTime: time(state.serverTime), hold: null };
  const hold = object(state.hold);
  if (
    typeof hold.id !== "string" ||
    !Array.isArray(hold.seatIds) ||
    !hold.seatIds.length ||
    hold.seatIds.some((id) => typeof id !== "string")
  )
    return invalid();
  return {
    serverTime: time(state.serverTime),
    hold: {
      id: hold.id,
      expiresAt: time(hold.expiresAt),
      seatIds: hold.seatIds as string[],
    },
  };
}
