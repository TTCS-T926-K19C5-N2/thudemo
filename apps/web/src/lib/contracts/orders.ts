import { ApiError, object } from "@/lib/api/client";

export type OrderItem = {
  id: string;
  seatId: string;
  row: string;
  seatNumber: number;
  label: string;
  tierName: string;
  unitPrice: number;
};

export type OrderDetail = {
  id: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "NEEDS_REVIEW";
  rawStatus: string;
  totalAmount: number;
  expiresAt: string;
  serverTime: string;
  remainingSeconds: number;
  isExpired: boolean;
  createdAt: string;
  event: {
    id: string;
    name: string;
    description: string;
    location: string;
    posterPath: string | null;
    bannerPath: string | null;
  };
  showtime: {
    id: string;
    startTime: string;
  };
  items: OrderItem[];
};

const invalid = (field?: string): never => {
  throw new ApiError(
    `Không đọc được dữ liệu đơn hàng${field ? `: ${field}` : ""}.`,
    502,
    "INVALID_RESPONSE",
  );
};

export function decodeOrderDetail(value: unknown): OrderDetail {
  const o = object(value);
  if (
    typeof o.id !== "string" ||
    typeof o.status !== "string" ||
    typeof o.totalAmount !== "number" ||
    typeof o.expiresAt !== "string" ||
    typeof o.serverTime !== "string" ||
    typeof o.remainingSeconds !== "number" ||
    typeof o.isExpired !== "boolean" ||
    typeof o.createdAt !== "string"
  ) {
    return invalid();
  }

  const eventObj = object(o.event);
  if (
    typeof eventObj.id !== "string" ||
    typeof eventObj.name !== "string" ||
    typeof eventObj.location !== "string"
  ) {
    return invalid("event");
  }

  const showtimeObj = object(o.showtime);
  if (
    typeof showtimeObj.id !== "string" ||
    typeof showtimeObj.startTime !== "string"
  ) {
    return invalid("showtime");
  }

  if (!Array.isArray(o.items)) {
    return invalid("items");
  }

  const items: OrderItem[] = o.items.map((itemRaw) => {
    const item = object(itemRaw);
    if (
      typeof item.id !== "string" ||
      typeof item.seatId !== "string" ||
      typeof item.row !== "string" ||
      typeof item.seatNumber !== "number" ||
      typeof item.label !== "string" ||
      typeof item.tierName !== "string" ||
      typeof item.unitPrice !== "number"
    ) {
      return invalid("item");
    }
    return {
      id: item.id,
      seatId: item.seatId,
      row: item.row,
      seatNumber: item.seatNumber,
      label: item.label,
      tierName: item.tierName,
      unitPrice: item.unitPrice,
    };
  });

  return {
    id: o.id,
    status: o.status as OrderDetail["status"],
    rawStatus: typeof o.rawStatus === "string" ? o.rawStatus : o.status,
    totalAmount: o.totalAmount,
    expiresAt: o.expiresAt,
    serverTime: o.serverTime,
    remainingSeconds: o.remainingSeconds,
    isExpired: o.isExpired,
    createdAt: o.createdAt,
    event: {
      id: eventObj.id,
      name: eventObj.name,
      description: typeof eventObj.description === "string" ? eventObj.description : "",
      location: eventObj.location,
      posterPath: typeof eventObj.posterPath === "string" ? eventObj.posterPath : null,
      bannerPath: typeof eventObj.bannerPath === "string" ? eventObj.bannerPath : null,
    },
    showtime: {
      id: showtimeObj.id,
      startTime: showtimeObj.startTime,
    },
    items,
  };
}

export type PayResponse = {
  redirectUrl: string;
  gatewayRef: string;
  paymentId: string;
};

export function decodePayResponse(value: unknown): PayResponse {
  const o = object(value);
  if (
    typeof o.redirectUrl !== "string" ||
    typeof o.gatewayRef !== "string" ||
    typeof o.paymentId !== "string"
  ) {
    throw new ApiError(
      "Không đọc được thông tin khởi tạo thanh toán.",
      502,
      "INVALID_RESPONSE",
    );
  }
  return {
    redirectUrl: o.redirectUrl,
    gatewayRef: o.gatewayRef,
    paymentId: o.paymentId,
  };
}
