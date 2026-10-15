"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { api, object, ApiError } from "@/lib/api/client";
import { parseTicketQr } from "shared/ticket-qr";
type Ticket = {
  ticketId: string;
  seatLabel: string;
  category: string;
  status: string;
  qrPayload: string | null;
};
function decodeTickets(value: unknown): Ticket[] {
  const data = object(value);
  if (!Array.isArray(data.tickets))
    throw new ApiError("Không tải được vé.", 502, "INVALID_RESPONSE");
  return data.tickets.map((raw) => {
    const item = object(raw);
    if (
      typeof item.ticketId !== "string" ||
      typeof item.seatLabel !== "string" ||
      typeof item.category !== "string" ||
      !["VALID", "CHECKED_IN", "CANCELLED"].includes(String(item.status)) ||
      (item.status === "CANCELLED"
        ? item.qrPayload !== null
        : !parseTicketQr(item.qrPayload))
    )
      throw new ApiError(
        "Vé chưa sẵn sàng. Hãy thử lại.",
        502,
        "INVALID_RESPONSE",
      );
    return item as Ticket;
  });
}
export function SignedTickets({ orderId }: { orderId: string }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api(`/orders/${orderId}/tickets`, decodeTickets, {
      signal: controller.signal,
    })
      .then((items) => {
        if (!controller.signal.aborted) {
          setTickets(items);
          setSelected(items[0]?.ticketId ?? "");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Không tải được QR vé. Kiểm tra kết nối và thử lại.");
      });
    return () => controller.abort();
  }, [orderId, version]);
  const ticket = tickets?.find((item) => item.ticketId === selected);
  return (
    <section
      aria-labelledby="ticket-qr-title"
      className="mt-6 rounded-xl border bg-card p-5 shadow-sm"
      data-testid="paid-ticket-qrs"
    >
      <h2 id="ticket-qr-title" className="text-lg font-semibold">
        Mã QR vé vào cửa
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Mở QR tại đây trước khi vào cửa. Mỗi vé chỉ dùng một lần.
      </p>
      <div role="status" aria-live="polite">
        {!tickets && !error && <p className="py-6">Đang tải QR vé…</p>}
        {error && (
          <>
            <p className="py-4 text-destructive">{error}</p>
            <Button
              onClick={() => {
                setError("");
                setTickets(null);
                setVersion((value) => value + 1);
              }}
            >
              Thử lại
            </Button>
          </>
        )}
        {tickets && !tickets.length && (
          <p className="py-6">Vé đang được chuẩn bị. Hãy kiểm tra lại sau.</p>
        )}
      </div>
      {!!tickets?.length && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Chọn vé">
          {tickets.map((item) => (
            <Button
              key={item.ticketId}
              variant={item.ticketId === selected ? "default" : "outline"}
              aria-pressed={item.ticketId === selected}
              className="min-h-12"
              onClick={() => setSelected(item.ticketId)}
            >
              {item.seatLabel}
            </Button>
          ))}
        </div>
      )}
      {ticket && (
        <div
          className="mt-5 flex flex-col items-center gap-3"
          data-testid="signed-ticket"
        >
          {ticket.qrPayload && (
            <div className="bg-white p-4">
              <QRCodeSVG
                value={ticket.qrPayload}
                size={256}
                style={{ width: 256, height: 256, maxWidth: "100%" }}
                marginSize={4}
                level="M"
                aria-label={`Mã QR vé ghế ${ticket.seatLabel}`}
              />
            </div>
          )}
          <p className="font-semibold">
            Ghế {ticket.seatLabel} · {ticket.category}
          </p>
          <p>
            {ticket.status === "CANCELLED"
              ? "Vé đã hủy"
              : ticket.status === "CHECKED_IN"
                ? "Vé đã sử dụng"
                : "Vé sẵn sàng vào cửa"}
          </p>
          <p className="text-xs text-muted-foreground">
            Mã vé: {ticket.ticketId.slice(0, 8)}
          </p>
        </div>
      )}
    </section>
  );
}
