import { ApiError, object } from "@/lib/api/client";

export type OrderStatus = "PENDING_PAYMENT" | "EXPIRED";
export type OrderItem = {
  seatId: string;
  row: string;
  seatNumber: number;
  categoryName: string;
  unitPrice: number;
};
export type Order = {
  id: string;
  status: OrderStatus;
  totalAmount: string;
  paymentExpiresAt: string;
  createdAt: string;
  showtime: {
    id: string;
    startTime: string;
    event: { name: string; location: string };
  };
  items: OrderItem[];
};
export type OrderResponse = {
  created?: boolean;
  serverTime: string;
  order: Order;
};

const invalid = (): never => {
  throw new ApiError(
    "Không đọc được thông tin đơn hàng. Hãy tải lại.",
    502,
    "INVALID_RESPONSE",
  );
};
const string = (value: unknown): string =>
  typeof value === "string" ? value : invalid();
const time = (value: unknown): string => {
  const result = string(value);
  return Number.isFinite(Date.parse(result)) ? result : invalid();
};
const integer = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : invalid();

export function decodeOrderResponse(value: unknown): OrderResponse {
  const response = object(value);
  if (response.created !== undefined && typeof response.created !== "boolean")
    return invalid();
  const source = object(response.order);
  const showtime = object(source.showtime);
  const event = object(showtime.event);
  if (
    source.status !== "PENDING_PAYMENT" &&
    source.status !== "EXPIRED"
  )
    return invalid();
  const totalAmount = string(source.totalAmount);
  if (!/^\d+$/.test(totalAmount)) return invalid();
  if (!Array.isArray(source.items) || !source.items.length) return invalid();
  const items = source.items.map((value) => {
    const item = object(value);
    return {
      seatId: string(item.seatId),
      row: string(item.row),
      seatNumber: integer(item.seatNumber),
      categoryName: string(item.categoryName),
      unitPrice: integer(item.unitPrice),
    };
  });
  if (
    items.reduce((sum, item) => sum + BigInt(item.unitPrice), BigInt(0)) !==
    BigInt(totalAmount)
  )
    return invalid();
  return {
    ...(response.created === undefined
      ? {}
      : { created: response.created as boolean }),
    serverTime: time(response.serverTime),
    order: {
      id: string(source.id),
      status: source.status,
      totalAmount,
      paymentExpiresAt: time(source.paymentExpiresAt),
      createdAt: time(source.createdAt),
      showtime: {
        id: string(showtime.id),
        startTime: time(showtime.startTime),
        event: {
          name: string(event.name),
          location: string(event.location),
        },
      },
      items,
    },
  };
}

