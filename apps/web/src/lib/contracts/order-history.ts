import { ApiError, object } from "@/lib/api/client";
import { decodeOrder, type OrderResult, type OrderStatus } from "./orders";

export type OrderSummary = {
  id: string;
  code: string;
  createdAt: string;
  status: OrderStatus;
  paymentExpiresAt: string;
  totalAmount: number;
  seatCount: number;
  showtime: {
    id: string;
    startTime: string;
    event: { id: string; name: string; location: string };
  };
};
export type OrderHistory = {
  serverTime: string;
  orders: OrderSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
};
export type OrderDetail = Omit<OrderResult, "order"> & {
  order: OrderSummary & OrderResult["order"];
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
  const valueText = text(value);
  return Number.isFinite(Date.parse(valueText)) ? valueText : invalid();
};
const integer = (value: unknown, minimum = 0): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
    ? value
    : invalid();
const boolean = (value: unknown): boolean =>
  typeof value === "boolean" ? value : invalid();

function decodeSummary(value: unknown): OrderSummary {
  const order = object(value),
    showtime = object(order.showtime),
    event = object(showtime.event);
  const status = order.status;
  if (
    ![
      "PENDING",
      "PENDING_PAYMENT",
      "PAID",
      "CANCELLED",
      "EXPIRED",
      "NEEDS_REVIEW",
    ].includes(String(status))
  )
    return invalid();
  return {
    id: text(order.id),
    code: text(order.code),
    createdAt: time(order.createdAt),
    status: status as OrderStatus,
    paymentExpiresAt: time(order.paymentExpiresAt),
    totalAmount: integer(order.totalAmount),
    seatCount: integer(order.seatCount, 1),
    showtime: {
      id: text(showtime.id),
      startTime: time(showtime.startTime),
      event: {
        id: text(event.id),
        name: text(event.name),
        location: text(event.location),
      },
    },
  };
}

export function decodeOrderHistory(value: unknown): OrderHistory {
  const root = object(value),
    metadata = object(root.pagination);
  if (!Array.isArray(root.orders)) return invalid();
  const pagination = {
    page: integer(metadata.page, 1),
    pageSize: integer(metadata.pageSize, 1),
    total: integer(metadata.total),
    totalPages: integer(metadata.totalPages),
    hasPrevious: boolean(metadata.hasPrevious),
    hasNext: boolean(metadata.hasNext),
  };
  if (
    pagination.pageSize > 50 ||
    root.orders.length > pagination.pageSize ||
    pagination.totalPages !== Math.ceil(pagination.total / pagination.pageSize)
  )
    return invalid();
  return {
    serverTime: time(root.serverTime),
    orders: root.orders.map(decodeSummary),
    pagination,
  };
}

export function decodeOrderDetail(value: unknown): OrderDetail {
  const detail = decodeOrder(value);
  const order = { ...detail.order, ...decodeSummary(object(value).order) };
  if (order.seatCount !== order.items.length) return invalid();
  return { ...detail, order };
}

export const historyDeadline = (value: OrderHistory) =>
  nextDeadline(value.serverTime, value.orders);
export const detailDeadline = (value: OrderDetail) =>
  nextDeadline(value.serverTime, [value.order]);
function nextDeadline(
  serverTime: string,
  orders: OrderSummary[],
): number | null {
  const pending = orders.filter(
    (order) => order.status === "PENDING_PAYMENT" || order.status === "PENDING",
  );
  return pending.length
    ? Math.min(...pending.map((order) => Date.parse(order.paymentExpiresAt))) -
        Date.parse(serverTime)
    : null;
}

export function historyPage(
  value: string | string[] | undefined,
): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= Math.floor(2147483647 / 10)
    ? page
    : null;
}
