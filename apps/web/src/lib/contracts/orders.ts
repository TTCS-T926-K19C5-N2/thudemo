import { ApiError, object } from "@/lib/api/client";

export type TicketItem = {
  id: string;
  ticketCode: string;
  seatId: string;
  price: number;
  qrCodeData: string;
  qrCodeImage?: string | null;
  seat: {
    row: string;
    seatNumber: number;
    category: {
      name: string;
    };
  };
};

export type EmailDeliveryResult = {
  success: boolean;
  attempts: number;
  error?: string;
  sentAt?: string;
};

export type OrderDetail = {
  id: string;
  userId: string;
  showtimeId: string;
  totalAmount: number;
  status: string;
  customerEmail: string;
  createdAt: string;
  showtime: {
    id: string;
    startTime: string;
    event: {
      name: string;
      location: string;
    };
  };
  tickets: TicketItem[];
  emailLogs?: {
    id: string;
    status: string;
    attempts: number;
    lastError?: string | null;
    sentAt?: string | null;
  }[];
};

export type CheckoutResponse = {
  order: OrderDetail;
  emailResult: EmailDeliveryResult;
};

export type ResendEmailResponse = {
  success: boolean;
  order: OrderDetail;
  emailResult: EmailDeliveryResult;
};

export function decodeCheckoutResponse(value: unknown): CheckoutResponse {
  const data = object(value);
  const order = object(data.order) as unknown as OrderDetail;
  const emailResult = object(data.emailResult) as unknown as EmailDeliveryResult;
  return { order, emailResult };
}

export function decodeResendResponse(value: unknown): ResendEmailResponse {
  const data = object(value);
  const order = object(data.order) as unknown as OrderDetail;
  const emailResult = object(data.emailResult) as unknown as EmailDeliveryResult;
  return {
    success: Boolean(data.success),
    order,
    emailResult,
  };
}

export function decodeOrdersList(value: unknown): OrderDetail[] {
  if (!Array.isArray(value)) {
    throw new ApiError("Dữ liệu danh sách đơn hàng không hợp lệ.", 502, "INVALID_RESPONSE");
  }
  return value as OrderDetail[];
}

export function decodeOrderDetail(value: unknown): OrderDetail {
  return object(value) as unknown as OrderDetail;
}
