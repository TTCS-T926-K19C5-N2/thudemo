"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CircleAlert, RotateCw, Ticket } from "@/components/ui/material-icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchOrderTickets,
  transferTicket,
  type OrderTicket,
  type OrderTicketStatus,
} from "./order-tickets-api";
import { Input } from "@/components/ui/input";

const STATUS_LABEL: Record<OrderTicketStatus, string> = {
  VALID: "Còn hiệu lực",
  CHECKED_IN: "Đã vào cửa",
  CANCELLED: "Đã huỷ",
};

// Rendered as an <img> from an SVG data URI: no canvas, no innerHTML.
function TicketQr({ payload, label }: { payload: string; label: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    void QRCode.toString(payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
    }).then((svg) => {
      if (!cancelled)
        setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (!src) return <Skeleton className="size-48" aria-label="Đang tạo mã QR" />;
  return (
    // QR stays black on white in dark mode so scanners can read it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Mã QR vé ${label}`}
      className="size-48 rounded-md bg-white p-1"
      data-testid="ticket-qr"
    />
  );
}

export function OrderTickets({ orderId }: { orderId: string }) {
  const [tickets, setTickets] = useState<OrderTicket[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [toEmail, setToEmail] = useState("");
  const [transferError, setTransferError] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  const handleTransfer = async (ticketId: string) => {
    if (!toEmail) {
      setTransferError("Vui lòng nhập email người nhận.");
      return;
    }
    setTransferError("");
    setIsTransferring(true);
    try {
      await transferTicket(orderId, ticketId, toEmail);
      setTransferringId(null);
      setToEmail("");
      setRetry((n) => n + 1); // reload tickets
    } catch (e: unknown) {
      setTransferError(e instanceof Error ? e.message : "Lỗi khi chuyển vé");
    } finally {
      setIsTransferring(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchOrderTickets(orderId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setTickets(next);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : "Không tải được vé.",
        );
      });
    return () => controller.abort();
  }, [orderId, retry]);

  return (
    <section
      className="rounded-xl border bg-card p-5 shadow-sm space-y-4"
      data-testid="order-tickets"
    >
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Ticket className="h-5 w-5 text-primary" />
        Vé của bạn
      </h2>

      {error ? (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Không tải được vé</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setRetry((n) => n + 1);
              }}
            >
              <RotateCw className="mr-2 h-4 w-4" /> Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      ) : tickets === null ? (
        <Skeleton className="h-56 w-full" aria-label="Đang tải vé" />
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Vé đang được phát hành. Vui lòng tải lại trang sau ít phút.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Xuất trình mã QR tại cửa soát vé. Mỗi mã chỉ dùng được một lần, không
            chia sẻ mã cho người khác.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex flex-col items-center gap-3 rounded-lg border p-4 text-center"
                data-testid={`ticket-${ticket.id}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-secondary font-mono text-sm font-semibold text-secondary-foreground">
                    {ticket.seatLabel}
                  </span>
                  <Badge
                    variant={ticket.status === "VALID" ? "secondary" : "outline"}
                  >
                    {STATUS_LABEL[ticket.status]}
                  </Badge>
                </div>
                {ticket.qrPayload && ticket.status !== "CANCELLED" ? (
                  <TicketQr payload={ticket.qrPayload} label={ticket.seatLabel} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8">
                    {ticket.status === "CANCELLED"
                      ? "Vé đã huỷ, mã QR không còn hiệu lực."
                      : "Vé này chưa có mã QR. Vui lòng liên hệ ban tổ chức."}
                  </p>
                )}
                <div className="text-xs text-muted-foreground">
                  {ticket.ticketType} · Mã vé{" "}
                  <span className="font-mono break-all">{ticket.code}</span>
                </div>
                {ticket.status === "VALID" && (
                  <div className="mt-4 w-full border-t pt-4">
                    {transferringId === ticket.id ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Email người nhận:</label>
                        <Input
                          type="email"
                          placeholder="nguoinhan@example.com"
                          value={toEmail}
                          onChange={(e) => setToEmail(e.target.value)}
                        />
                        {transferError && <p className="text-sm text-red-500">{transferError}</p>}
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTransferringId(null);
                              setTransferError("");
                            }}
                            disabled={isTransferring}
                          >
                            Huỷ
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleTransfer(ticket.id)}
                            disabled={isTransferring}
                          >
                            Xác nhận chuyển
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setTransferringId(ticket.id);
                          setToEmail("");
                          setTransferError("");
                        }}
                      >
                        Chuyển nhượng vé
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
