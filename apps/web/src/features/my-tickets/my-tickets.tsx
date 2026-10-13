"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadCurrentUser } from "@/lib/api";
import { api, object, ApiError } from "@/lib/api/client";
import { parseTicketQr } from "shared/ticket-qr";

type MyTicket = {
  ticketId: string;
  eventName: string;
  startTime: string;
  upcoming: boolean;
  seatLabel: string;
  category: string;
  status: "VALID" | "CHECKED_IN" | "CANCELLED";
  qrPayload: string | null;
};

function decodeTickets(value: unknown): MyTicket[] {
  const data = object(value);
  if (!Array.isArray(data.tickets))
    throw new ApiError("Không tải được vé.", 502, "INVALID_RESPONSE");
  return data.tickets.map((raw) => {
    const item = object(raw);
    if (
      typeof item.ticketId !== "string" ||
      typeof item.eventName !== "string" ||
      typeof item.startTime !== "string" ||
      typeof item.upcoming !== "boolean" ||
      typeof item.seatLabel !== "string" ||
      typeof item.category !== "string" ||
      !["VALID", "CHECKED_IN", "CANCELLED"].includes(String(item.status)) ||
      (item.status === "CANCELLED"
        ? item.qrPayload !== null
        : !parseTicketQr(item.qrPayload))
    )
      throw new ApiError("Vé chưa sẵn sàng. Hãy thử lại.", 502, "INVALID_RESPONSE");
    return item as unknown as MyTicket;
  });
}

const statusText: Record<MyTicket["status"], string> = {
  VALID: "Sẵn sàng vào cửa",
  CHECKED_IN: "Đã sử dụng",
  CANCELLED: "Đã hủy",
};

export function MyTickets() {
  const router = useRouter();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadCurrentUser()
      .then((user) => {
        if (controller.signal.aborted) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        return api("/tickets/mine", decodeTickets, {
          signal: controller.signal,
        }).then((items) => {
          if (!controller.signal.aborted) setTickets(items);
        });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Không tải được vé. Kiểm tra kết nối và thử lại.");
      });
    return () => controller.abort();
  }, [router, version]);

  return (
    <PublicLayout signedIn>
      <div className="operations-page">
        <div className="page-heading">
          <div>
            <h1>Vé của tôi</h1>
            <p>Vé của bạn trên mọi suất diễn. Mở QR tại đây trước khi vào cửa.</p>
          </div>
        </div>

        {!tickets && !error && (
          <div role="status" aria-label="Đang tải vé">
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {error && (
          <section className="operations-panel" role="alert">
            <p>{error}</p>
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setTickets(null);
                setVersion((value) => value + 1);
              }}
            >
              Thử lại
            </Button>
          </section>
        )}

        {tickets && !tickets.length && (
          <section className="operations-panel">
            <p>Bạn chưa có vé nào.</p>
            <Button asChild>
              <Link href="/">Khám phá sự kiện</Link>
            </Button>
          </section>
        )}

        {tickets?.map((ticket) => (
          <section
            key={ticket.ticketId}
            className="operations-panel"
            data-testid="my-ticket"
            data-upcoming={ticket.upcoming}
          >
            <h2>{ticket.eventName}</h2>
            <p>
              {new Date(ticket.startTime).toLocaleString("vi-VN")}
              {!ticket.upcoming && " · Đã qua"}
            </p>
            <p>
              Ghế {ticket.seatLabel} · {ticket.category} ·{" "}
              {statusText[ticket.status]}
            </p>
            {ticket.qrPayload && (
              <div className="bg-white p-4" style={{ width: "fit-content" }}>
                <QRCodeSVG
                  value={ticket.qrPayload}
                  size={200}
                  marginSize={4}
                  level="M"
                  aria-label={`Mã QR vé ghế ${ticket.seatLabel}`}
                />
              </div>
            )}
          </section>
        ))}
      </div>
    </PublicLayout>
  );
}
