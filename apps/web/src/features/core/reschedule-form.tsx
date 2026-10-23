"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, object } from "@/lib/api/client";
import { vietnamInputToUtc } from "@/lib/formatting/vietnam-input";
export function RescheduleForm({
  id,
  startTime,
  onChanged,
}: {
  id: string;
  startTime: string;
  onChanged: () => Promise<unknown>;
}) {
  const [time, setTime] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = vietnamInputToUtc(time);
    if (!parsed || new Date(parsed) <= new Date()) {
      setMessage("Chọn giờ Việt Nam trong tương lai.");
      return;
    }
    const key = JSON.stringify([parsed, reason.trim()]);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setMessage("");
    try {
      const r = await api(`/showtimes/${id}/reschedule`, object, {
        method: "POST",
        body: {
          startTime: parsed,
          reason: reason.trim(),
          requestId: request.current.id,
        },
      });
      setMessage(
        `Đã đổi giờ; thông báo được xếp hàng (QUEUED). ${r.workerEnabled === false ? "Worker thông báo đang tắt, thư chưa được gửi." : ""}`,
      );
      setConfirmed(false);
      await onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không đổi được giờ.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="operations-panel space-y-3"
    >
      <h2>Đổi giờ diễn</h2>
      <p>
        Giờ hiện tại:{" "}
        {new Date(startTime).toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        })}{" "}
        (Việt Nam)
      </p>
      <label className="block">
        Giờ mới (Việt Nam)
        <Input
          type="datetime-local"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className="block">
        Lý do đổi giờ
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={1000}
          required
          disabled={busy}
        />
      </label>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={busy}
        />
        Tôi xác nhận đổi giờ và thông báo người mua; ghế, vé và QR được giữ
        nguyên.
      </label>
      <Button disabled={busy || !confirmed}>
        {busy ? "Đang cập nhật…" : "Xác nhận đổi giờ"}
      </Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
