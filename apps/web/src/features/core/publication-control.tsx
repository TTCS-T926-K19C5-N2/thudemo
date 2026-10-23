"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, object } from "@/lib/api/client";
export function PublicationControl({
  id,
  initialStatus,
  onStatusChanged,
}: {
  id: string;
  initialStatus: string;
  onStatusChanged?: (status: string) => void;
}) {
  const [status, setStatus] = useState(initialStatus),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function change() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/events/${id}/publication`, object, {
        method: "PATCH",
        body: { status: status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" },
      });
      setStatus(String(result.status));
      onStatusChanged?.(String(result.status));
      setConfirmed(false);
      setMessage(
        result.status === "PUBLISHED"
          ? "Sự kiện đã được công bố."
          : "Đã ẩn sự kiện; đơn và vé đã bán vẫn được giữ.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Chưa cập nhật được.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operations-panel space-y-3">
      <h2>Công bố sự kiện</h2>
      <p>Trạng thái: {status === "PUBLISHED" ? "Đã công bố" : "Nháp"}</p>
      <p>
        Công bố cần ít nhất một suất tương lai đang mở bán, đủ ghế và giá vé.
      </p>
      {status === "PUBLISHED" && (
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={busy}
          />
          Tôi xác nhận ẩn khỏi trang công khai; thao tác này không huỷ đơn hoặc
          vé đã bán.
        </label>
      )}
      <Button
        disabled={busy || (status === "PUBLISHED" && !confirmed)}
        onClick={() => void change()}
      >
        {busy
          ? "Đang cập nhật…"
          : status === "PUBLISHED"
            ? "Ẩn sự kiện"
            : "Công bố sự kiện"}
      </Button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
