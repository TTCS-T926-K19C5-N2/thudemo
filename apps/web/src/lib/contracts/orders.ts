import { ApiError, object } from "@/lib/api/client";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "EXPIRED"
  | "CANCELLED";
export type OrderResult = {
  serverTime: string;
  created: boolean;
  order: {
    id: string;
    status: OrderStatus;
    paymentExpiresAt: string;
    totalAmount: number;
    items: {
      seatId: string;
      row: string;
      seatNumber: number;
      categoryName: string;
      unitPrice: number;
    }[];
  };
};

const invalid = (): never => {
  throw new ApiError(
    "Không đọc được đơn hàng. Hãy thử lại.",
    502,
    "INVALID_RESPONSE",
  );
};
const text = (value: unknown): string =>
  typeof value === "string" && value.length > 0 ? value : invalid();
const time = (value: unknown): string => {
  const result = text(value);
  return Number.isFinite(Date.parse(result)) ? result : invalid();
};
const money = (value: unknown): number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0
    ? value
    : invalid();

const orderStatus = (value: unknown): OrderStatus =>
  value === "PENDING_PAYMENT" ||
  value === "PAID" ||
  value === "EXPIRED" ||
  value === "CANCELLED"
    ? value
    : invalid();

export function decodeOrder(value: unknown): OrderResult {
  const result = object(value);
  const order = object(result.order);
  if (
    typeof result.created !== "boolean" ||
    !Array.isArray(order.items) ||
    order.items.length === 0
  )
    return invalid();
  const items = order.items.map((value) => {
    const item = object(value);
    const seat = object(item.seat);
    return {
      seatId: text(item.seatId),
      row: text(seat.row),
      seatNumber:
        Number.isInteger(seat.seatNumber) && Number(seat.seatNumber) > 0
          ? Number(seat.seatNumber)
          : invalid(),
      categoryName: text(item.categoryName),
      unitPrice: money(item.unitPrice),
    };
  });
  if (new Set(items.map((item) => item.seatId)).size !== items.length)
    return invalid();
  return {
    serverTime: time(result.serverTime),
    created: result.created,
    order: {
      id: text(order.id),
      status: orderStatus(order.status),
      paymentExpiresAt: time(order.paymentExpiresAt),
      totalAmount: money(order.totalAmount),
      items,
    },
  };
}

export function decodePendingOrder(value: unknown): OrderResult {
  const result = decodeOrder(value);
  return result.order.status === "PENDING_PAYMENT" ? result : invalid();
}
