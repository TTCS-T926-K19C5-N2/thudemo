"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { loadCurrentUser } from "@/lib/api";
import { Button } from "@/components/ui/button";

type AuditEvent = {
  id: string;
  source: string;
  action: string;
  actorId: string | null;
  at: string;
  detail: Record<string, unknown> | null;
  attemptNo: number | null;
};

function decodeAudit(value: unknown): AuditEvent[] {
  if (!value || typeof value !== "object" || !("events" in value))
    throw new Error("Dữ liệu nhật ký không hợp lệ.");
  const events = (value as { events: unknown }).events;
  if (!Array.isArray(events)) throw new Error("Dữ liệu nhật ký không hợp lệ.");
  return events.map((event) => {
    if (!event || typeof event !== "object")
      throw new Error("Dữ liệu nhật ký không hợp lệ.");
    const row = event as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.action !== "string" ||
      typeof row.at !== "string"
    )
      throw new Error("Dữ liệu nhật ký không hợp lệ.");
    return {
      id: row.id,
      source: typeof row.source === "string" ? row.source : "ORDER",
      action: row.action,
      actorId: typeof row.actorId === "string" ? row.actorId : null,
      at: row.at,
      detail:
        row.detail && typeof row.detail === "object"
          ? (row.detail as Record<string, unknown>)
          : null,
      attemptNo: typeof row.attemptNo === "number" ? row.attemptNo : null,
    };
  });
}

const labels: Record<string, string> = {
  ORDER_CREATED: "Tạo đơn hàng",
  ORDER_STATUS_CHANGED: "Thay đổi trạng thái đơn",
  PAYMENT_ATTEMPT: "Khởi tạo thanh toán",
  PAYMENT_FAILED: "Thanh toán thất bại",
  RETRY_REJECTED_EXPIRED: "Từ chối thanh toán lại do hết hạn",
  ISSUED: "Phát hành vé",
  TRANSFERRED: "Chuyển nhượng vé",
  ISSUED_FROM_TRANSFER: "Phát hành vé nhận chuyển nhượng",
  CLAIMED: "Giữ ghế",
  RECLAIMED: "Nhận lại hoặc gia hạn ghế",
  RELEASED: "Giải phóng ghế",
  EXPIRED: "Lượt giữ ghế hết hạn",
  CHECK_IN: "Soát vé",
  CHECK_IN_EXCEPTION: "Soát vé ngoại lệ",
};

export function OrderAuditLog({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadCurrentUser()
      .then((user) => {
        if (controller.signal.aborted) return;
        if (!user?.roles.includes("ADMIN")) {
          setDenied(true);
          return;
        }
        return api(`/orders/${orderId}/audit-log`, decodeAudit, {
          signal: controller.signal,
        }).then(setEvents);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          if (reason instanceof ApiError && reason.status === 403) setDenied(true);
          else setError(
            reason instanceof Error ? reason.message : "Không tải được nhật ký.",
          );
        }
      });
    return () => controller.abort();
  }, [orderId, retry]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <section
        className="rounded-xl border bg-card p-4 sm:p-6"
        aria-labelledby="order-audit-title"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 id="order-audit-title" className="text-xl font-semibold">
              Nhật ký đơn hàng
            </h1>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              Đơn {orderId}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError("");
              setDenied(false);
              setEvents(null);
              setRetry((value) => value + 1);
            }}
          >
            Tải lại
          </Button>
        </div>
        {denied ? (
          <p role="alert" className="text-sm text-destructive">
            Nhật ký chỉ dành cho quản trị viên.
          </p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        ) : events === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Đang tải nhật ký…
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có sự kiện nhật ký.
          </p>
        ) : (
          <ol className="space-y-4">
            {events.map((event) => (
              <li
                key={`${event.source}-${event.id}`}
                className="border-l-2 pl-3 text-sm"
              >
                <p className="font-medium">
                  {labels[event.action] ?? event.action}
                  {event.attemptNo ? ` · Lần ${event.attemptNo}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.at).toLocaleString("vi-VN")} · {event.actorId
                    ? `Tác nhân ${event.actorId}`
                    : "Hệ thống"}
                </p>
                {event.detail && (
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {Object.entries(event.detail)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
