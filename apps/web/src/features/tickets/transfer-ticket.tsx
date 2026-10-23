"use client";
import { useState } from "react";
import { api, object } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

export function TransferTicket({
  orderId,
  ticketId,
  seatLabel,
  onTransferred,
}: {
  orderId: string;
  ticketId: string;
  seatLabel: string;
  onTransferred?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleTransfer = async () => {
    const trimmed = toEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }
    setPending(true);
    setError("");
    setMessage("");

    try {
      await api(
        `/orders/${orderId}/tickets/${ticketId}/transfer`,
        object,
        {
          method: "POST",
          body: { toEmail: trimmed },
        },
      );
      setMessage(`Đã chuyển nhượng vé thành công đến ${trimmed}!`);
      setTimeout(() => {
        onTransferred?.();
      }, 1000);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể chuyển nhượng vé. Vui lòng thử lại.",
      );
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setError("");
          setMessage("");
        }}
        data-testid="btn-open-transfer"
      >
        Chuyển nhượng vé
      </Button>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/20">
      <div className="text-sm font-medium">
        Chuyển nhượng vé ghế <strong>{seatLabel}</strong>
      </div>
      <p className="text-xs text-muted-foreground">
        Sau khi chuyển nhượng, mã QR cũ của bạn sẽ bị thu hồi và người nhận sẽ sở hữu vé mới.
      </p>
      <div className="space-y-2">
        <input
          type="email"
          className="w-full rounded border px-3 py-1.5 text-sm"
          placeholder="Nhập email người nhận (ví dụ: buyer2@example.com)"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !toEmail.trim()}
          onClick={handleTransfer}
          data-testid="btn-confirm-transfer"
        >
          {pending ? "Đang xử lý…" : "Xác nhận chuyển"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError("");
          }}
        >
          Hủy
        </Button>
      </div>
      {message && <p className="text-sm text-green-600" role="status">{message}</p>}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
