"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadCurrentUser } from "@/lib/api";
import { api, object } from "@/lib/api/client";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { TicketQrImage } from "./ticket-qr-image";
import { ResendTickets } from "./resend-tickets";
import { TransferTicket } from "./transfer-ticket";

type Ticket = {
  ticketId: string;
  orderId: string;
  eventName: string;
  showtimeStart: string;
  category: string;
  seatLabel: string;
  status: string;
  qrPayload: string | null;
  transferred?: boolean;
};
type View = {
  tickets: Ticket[];
  pagination: { total: number; hasNext: boolean };
};
function decode(value: unknown): View {
  const data = object(value),
    pagination = object(data.pagination);
  if (
    !Array.isArray(data.tickets) ||
    typeof pagination.total !== "number" ||
    typeof pagination.hasNext !== "boolean"
  )
    throw Error("Không đọc được danh sách vé.");
  const tickets = data.tickets.map((raw) => {
    const t = object(raw);
    for (const key of [
      "ticketId",
      "orderId",
      "eventName",
      "showtimeStart",
      "category",
      "seatLabel",
      "status",
    ])
      if (typeof t[key] !== "string") throw Error("Vé chưa sẵn sàng.");
    if (
      !Number.isFinite(Date.parse(t.showtimeStart as string)) ||
      !["VALID", "CHECKED_IN", "CANCELLED"].includes(t.status as string) ||
      (t.status === "CANCELLED"
        ? t.qrPayload !== null
        : typeof t.qrPayload !== "string")
    )
      throw Error("Mã QR vé chưa sẵn sàng.");
    return t as Ticket;
  });
  return {
    tickets,
    pagination: { total: pagination.total, hasNext: pagination.hasNext },
  };
}
export function MyTickets({ page }: { page: number }) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [login, setLogin] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void loadCurrentUser()
      .then(async (user) => {
        if (!user?.roles.includes("BUYER")) {
          if (!abort.signal.aborted) {
            setLogin(true);
            setError("Vui lòng đăng nhập bằng tài khoản người mua để xem vé.");
          }
          return;
        }
        if (!abort.signal.aborted) setLogin(false);
        const data = await api(`/tickets/me?page=${page}`, decode, {
          signal: abort.signal,
        });
        if (!abort.signal.aborted) setView(data);
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "Không tải được vé.",
          );
      });
    const changed = () => {
      setView(null);
      setError("");
      setVersion((v) => v + 1);
    };
    window.addEventListener("account-session-changed", changed);
    return () => {
      abort.abort();
      window.removeEventListener("account-session-changed", changed);
    };
  }, [page, version]);
  return (
    <PublicLayout signedIn={!login}>
      <div className="operations-page mx-auto max-w-5xl space-y-5 px-4 py-8">
        <h1 className="text-2xl font-bold">Vé của tôi</h1>
        <p>Vé sắp diễn trước, vé đã qua sau. Mỗi QR chỉ dùng một lần.</p>
        {error ? (
          <section role="alert">
            <p>{error}</p>
            {login ? (
              <Button asChild>
                <Link href="/login?returnTo=%2Faccount%2Ftickets">
                  Đăng nhập
                </Link>
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setView(null);
                  setError("");
                  setVersion((v) => v + 1);
                }}
              >
                Thử lại
              </Button>
            )}
          </section>
        ) : !view ? (
          <p role="status">Đang tải vé…</p>
        ) : (
          <>
            {!view.tickets.length && (
              <p role="status">Bạn chưa có vé ở trang này.</p>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              {view.tickets.map((ticket) => (
                <article
                  key={ticket.ticketId}
                  className={`operations-panel space-y-3 ${ticket.status === "CANCELLED" ? "opacity-50" : ""}`}
                  data-testid="my-ticket"
                  data-ticket-id={ticket.ticketId}
                >
                  <h2 className="text-lg font-semibold">{ticket.eventName}</h2>
                  <p>
                    {new Date(ticket.showtimeStart).toLocaleString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                    })}
                  </p>
                  <p>
                    {ticket.category} · Ghế {ticket.seatLabel}
                  </p>
                  {ticket.transferred && <p>Vé được chuyển nhượng cho tài khoản này.</p>}
                  <p>
                    {ticket.status === "CANCELLED"
                      ? "Vé đã huỷ"
                      : ticket.status === "CHECKED_IN"
                        ? "Vé đã sử dụng"
                        : "Vé còn hiệu lực"}
                  </p>
                  {ticket.status !== "CANCELLED" && ticket.qrPayload && (
                    <TicketQrImage
                      payload={ticket.qrPayload}
                      ticketId={ticket.ticketId}
                      seatLabel={ticket.seatLabel}
                    />
                  )}
                  {!ticket.transferred && <Link href={`/orders/${ticket.orderId}`}>Xem đơn hàng</Link>}
                  {!ticket.transferred && ticket.status !== "CANCELLED" && (
                    <ResendTickets orderId={ticket.orderId} />
                  )}
                  {!ticket.transferred && ticket.status === "VALID" && (
                    <TransferTicket
                      orderId={ticket.orderId}
                      ticketId={ticket.ticketId}
                      seatLabel={ticket.seatLabel}
                      onTransferred={() => {
                        setView(null);
                        setError("");
                        setVersion((v) => v + 1);
                      }}
                    />
                  )}
                </article>
              ))}
            </div>
            <nav
              className="flex min-h-11 items-center justify-between gap-4"
              aria-label="Phân trang vé"
            >
              {page > 1 ? (
                <Link href={`/account/tickets?page=${page - 1}`}>
                  Trang trước
                </Link>
              ) : (
                <span />
              )}
              <span>
                Trang {page} · {view.pagination.total} vé
              </span>
              {view.pagination.hasNext ? (
                <Link href={`/account/tickets?page=${page + 1}`}>
                  Trang sau
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
