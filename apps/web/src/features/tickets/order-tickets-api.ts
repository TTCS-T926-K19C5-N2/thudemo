import { ApiError, api, object } from "@/lib/api/client";

export type OrderTicketStatus = "VALID" | "CHECKED_IN" | "CANCELLED";

export type OrderTicket = {
  id: string;
  code: string;
  seatLabel: string;
  ticketType: string;
  status: OrderTicketStatus;
  transferredToEmail?: string | null;
  // Signed QR content (see ./ticket-qr). Null for tickets issued without a signature.
  qrPayload: string | null;
};

const STATUSES: readonly OrderTicketStatus[] = ["VALID", "CHECKED_IN", "CANCELLED"];

const invalid = (): never => {
  throw new ApiError("Không đọc được dữ liệu vé.", 502, "INVALID_RESPONSE");
};

export function decodeOrderTickets(value: unknown): OrderTicket[] {
  const data = object(value);
  if (!Array.isArray(data.tickets)) return invalid();
  return data.tickets.map((raw) => {
    const t = object(raw);
    if (typeof t.id !== "string" || typeof t.code !== "string") return invalid();
    const status = STATUSES.find((s) => s === t.status) ?? invalid();
    return {
      id: t.id,
      code: t.code,
      seatLabel: String(t.seatLabel ?? ""),
      ticketType: String(t.ticketType ?? ""),
      status,
      transferredToEmail: typeof t.transferredToEmail === "string" ? t.transferredToEmail : null,
      qrPayload: typeof t.qrPayload === "string" ? t.qrPayload : null,
    };
  });
}

export function fetchOrderTickets(orderId: string, signal?: AbortSignal) {
  return api(`/orders/${orderId}/tickets`, decodeOrderTickets, { signal });
}

export type ResendTicketsResult = { sent: boolean; attempts: number; error?: string };

// Re-sends the tickets already issued for this order. Never creates tickets (S-27 AC3).
export function resendOrderTickets(orderId: string) {
  return api(
    `/orders/${orderId}/tickets/resend`,
    (value): ResendTicketsResult => {
      const data = object(value);
      return {
        sent: data.sent === true,
        attempts: typeof data.attempts === "number" ? data.attempts : 0,
        error: typeof data.error === "string" ? data.error : undefined,
      };
    },
    { method: "POST", body: {} }
  );
}

export async function transferTicket(orderId: string, ticketId: string, toEmail: string) {
  return api(
    `/orders/${orderId}/tickets/${ticketId}/transfer`,
    () => ({ success: true }),
    {
      method: "POST",
      body: { toEmail },
    }
  );
}
