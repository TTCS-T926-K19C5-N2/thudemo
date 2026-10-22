"use client";
import { useEffect, useState } from "react";
import { api, object } from "@/lib/api/client";
import { formatVnd } from "@/lib/formatting";
import { Button } from "@/components/ui/button";

type Preview = {
  eligible: boolean;
  amount: number;
  unavailable: string | null;
  refund: { status: string; amount: number } | null;
};
export function OrderCancellation({ id }: { id: string }) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = await api(
          `/orders/${id}/cancellation`,
          (value) => object(value) as unknown as Preview,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setPreview(data);
        setError("");
        if (data.refund && ["QUEUED", "SENDING"].includes(data.refund.status))
          timer = setTimeout(() => void load(), 3000);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Không tải được chính sách huỷ.",
          );
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  async function cancel() {
    if (busy || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      await api(`/orders/${id}/cancel`, object, { method: "POST", body: {} });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa huỷ được đơn.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operations-panel">
      <h2>Huỷ đơn và hoàn tiền</h2>
      <p>
        Chính sách demo: huỷ toàn đơn trước giờ diễn ít nhất 24 giờ, hoàn 100%,
        chưa có vé đã soát. Ghế mở bán lại sau huỷ. Chỉ áp dụng thanh toán giả
        lập, không chuyển tiền thật.
      </p>
      {!preview && !error && <p role="status">Đang kiểm tra điều kiện huỷ…</p>}
      {preview?.refund ? (
        <p role="status">
          Trạng thái hoàn tiền giả lập: <strong>{preview.refund.status}</strong>{" "}
          · {formatVnd(preview.refund.amount)}
        </p>
      ) : preview?.eligible ? (
        <>
          <p>
            Số tiền hoàn giả lập: <strong>{formatVnd(preview.amount)}</strong>
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={busy}
            />
            Tôi xác nhận huỷ toàn bộ vé trong đơn; mã QR cũ sẽ không còn hiệu
            lực.
          </label>
          <Button
            variant="destructive"
            disabled={!confirmed || busy}
            onClick={() => void cancel()}
          >
            {busy ? "Đang huỷ…" : "Huỷ đơn và hoàn tiền giả lập"}
          </Button>
        </>
      ) : (
        preview && <p>{preview.unavailable}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
