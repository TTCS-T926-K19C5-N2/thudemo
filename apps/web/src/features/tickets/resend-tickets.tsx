"use client";
import { useRef, useState } from "react";
import { api, object } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

export function ResendTickets({ orderId }: { orderId: string }) {
  const action = useRef<string | null>(null),
    busy = useRef(false);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={async () => {
          if (busy.current) return;
          busy.current = true;
          setPending(true);
          setMessage("");
          setError("");
          action.current ??= crypto.randomUUID();
          try {
            await api(`/orders/${orderId}/tickets/resend`, object, {
              method: "POST",
              body: { requestId: action.current },
            });
            setMessage(
              "Đã nhận yêu cầu gửi lại vé. Vui lòng kiểm tra hộp thư.",
            );
            action.current = null;
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Chưa gửi lại được vé. Hãy thử lại.",
            );
          } finally {
            busy.current = false;
            setPending(false);
          }
        }}
      >
        {pending ? "Đang gửi yêu cầu…" : "Gửi lại vé qua email"}
      </Button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
