"use client";
import { useEffect, useState } from "react";
import { api, object } from "@/lib/api/client";
type Audit = {
  id: string;
  entityType: string;
  actorType: string;
  actorId: string | null;
  action: string;
  createdAt: string;
  beforeState: { status?: string } | null;
  afterState: { status?: string } | null;
};
export function OrderAudit({ id }: { id: string }) {
  const [events, setEvents] = useState<Audit[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    void api(`/orders/${id}/audit`, object, { signal: c.signal })
      .then((v) => {
        if (!Array.isArray(v.events)) throw Error("Không đọc được nhật ký.");
        setEvents(v.events as Audit[]);
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "Không tải được nhật ký.");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id]);
  return (
    <details className="operations-panel">
      <summary>Nhật ký đơn hàng và vé</summary>
      {loading && <p role="status">Đang tải…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !events.length && !error && (
        <p>
          Chưa có bản ghi trong hệ thống nhật ký mới. Dữ liệu cũ không được tạo
          lịch sử giả.
        </p>
      )}
      <ol>
        {events.map((e) => (
          <li key={e.id}>
            {new Date(e.createdAt).toLocaleString("vi-VN")} · {e.entityType} ·{" "}
            {e.action} · {e.beforeState?.status ?? "—"} →{" "}
            {e.afterState?.status ?? "—"} ·{" "}
            {e.actorType === "SYSTEM" ? "Hệ thống" : `Người dùng ${e.actorId}`}
          </li>
        ))}
      </ol>
    </details>
  );
}
