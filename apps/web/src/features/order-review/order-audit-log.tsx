"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { OrganizerLayout } from "@/components/layout/product-layout";
import { api, ApiError, object } from "@/lib/api/client";
import { loadCurrentUser } from "@/lib/api";

type AuditEvent = {
  id: string;
  source: string;
  action: string;
  actorId: string | null;
  actorType: string;
  at: string;
  fromStatus: string | null;
  toStatus: string | null;
  detail: Record<string, unknown>;
  attemptNo: number | null;
};

function decodeAudit(value: unknown): AuditEvent[] {
  const data = object(value);
  if (!Array.isArray(data.events)) throw new Error("Dữ liệu nhật ký không hợp lệ.");
  return data.events.map((value: unknown) => {
    const item = object(value);
    if (typeof item.id !== "string" || typeof item.action !== "string" || typeof item.at !== "string")
      throw new Error("Dữ liệu nhật ký không hợp lệ.");
    return {
      id: item.id,
      source: typeof item.source === "string" ? item.source : "ORDER",
      action: item.action,
      actorId: typeof item.actorId === "string" ? item.actorId : null,
      actorType: typeof item.actorType === "string" ? item.actorType : "SYSTEM",
      at: item.at,
      fromStatus: typeof item.fromStatus === "string" ? item.fromStatus : null,
      toStatus: typeof item.toStatus === "string" ? item.toStatus : null,
      detail: item.detail && typeof item.detail === "object" ? item.detail as Record<string, unknown> : {},
      attemptNo: typeof item.attemptNo === "number" ? item.attemptNo : null,
    };
  });
}

const actionLabels: Record<string, string> = {
  ORDER_CREATED: "Tạo đơn hàng",
  ORDER_STATUS_CHANGED: "Thay đổi trạng thái đơn",
  PAYMENT_ATTEMPT: "Khởi tạo thanh toán",
  PAYMENT_FAILED: "Thanh toán thất bại",
  RETRY_REJECTED_EXPIRED: "Từ chối thanh toán lại do đơn hết hạn",
  ISSUED: "Phát hành vé",
  TRANSFERRED: "Chuyển nhượng vé",
  ISSUED_FROM_TRANSFER: "Phát hành vé chuyển nhượng",
  CLAIMED: "Giữ ghế",
  EXTENDED: "Gia hạn giữ ghế",
  RECLAIMED: "Nhận giữ ghế",
  RELEASED: "Giải phóng ghế",
  EXPIRED: "Lượt giữ ghế hết hạn",
  CHECK_IN: "Soát vé",
  CHECK_IN_EXCEPTION: "Soát vé ngoại lệ",
};

export function OrderAuditLog({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    loadCurrentUser().then((user) => {
      if (abort.signal.aborted) return;
      if (!user?.roles.includes("ADMIN")) {
        setDenied(true);
        return;
      }
      return api(`/orders/${orderId}/audit-log`, decodeAudit, { signal: abort.signal }).then(setEvents);
    }).catch((reason: unknown) => {
      if (abort.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 403) setDenied(true);
      else setError(reason instanceof Error ? reason.message : "Không tải được nhật ký.");
    });
    return () => abort.abort();
  }, [orderId, reload]);

  return (
    <OrganizerLayout title="Nhật ký thao tác đơn hàng" mode="account">
      <section className="operations-page space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Lịch sử đơn hàng</h1><p className="break-all text-sm text-muted-foreground">{orderId}</p></div>
          <Button variant="outline" onClick={() => { setEvents(null); setDenied(false); setError(""); setReload((value) => value + 1); }}>Tải lại</Button>
        </header>
        {denied ? <p role="alert">Bạn không có quyền xem nhật ký này.</p>
          : error ? <p role="alert" className="text-destructive">{error}</p>
          : events === null ? <p role="status">Đang tải nhật ký…</p>
          : events.length === 0 ? <p>Chưa có sự kiện.</p>
          : <ol className="space-y-4">
            {events.map((event) => <li key={`${event.source}-${event.id}`} className="rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2"><strong>{actionLabels[event.action] ?? event.action}</strong><time dateTime={event.at}>{new Date(event.at).toLocaleString("vi-VN")}</time></div>
              <p className="text-sm text-muted-foreground">{event.actorType === "SYSTEM" ? "Hệ thống" : `${event.actorType}${event.actorId ? ` · ${event.actorId}` : ""}`} · {event.source}{event.attemptNo ? ` · lần ${event.attemptNo}` : ""}</p>
              {(event.fromStatus || event.toStatus) && <p className="text-sm">Trạng thái: {event.fromStatus ?? "—"} → {event.toStatus ?? "—"}</p>}
              {Object.keys(event.detail).length > 0 && <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{Object.entries(event.detail).map(([key, value]) => <div key={key} className="break-words"><dt className="inline font-medium">{key}: </dt><dd className="inline">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>}
            </li>)}
          </ol>}
      </section>
    </OrganizerLayout>
  );
}
