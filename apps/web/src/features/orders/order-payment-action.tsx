"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api/client";
import { decodePayResponse } from "@/lib/contracts/orders";
import type { OrderSummary } from "@/lib/contracts/order-history";
import { formatShowtime } from "@/lib/formatting";
import {
  countdownLabel,
  remainingSeconds,
} from "@/features/seat-selection/server-countdown";

// Preserve the existing S-17/S-19 action; mounting or reading never initiates payment.
export function OrderPaymentAction({
  order,
  serverTime,
  onPay,
}: {
  order: OrderSummary;
  serverTime: string;
  onPay?: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(
      0,
      Math.ceil(
        (Date.parse(order.paymentExpiresAt) - Date.parse(serverTime)) / 1000,
      ),
    ),
  );
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const clock = {
      serverMs: Date.parse(serverTime),
      receivedAt: performance.now(),
    };
    const tick = () =>
      setRemaining(
        remainingSeconds(order.paymentExpiresAt, clock, performance.now()),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [order.paymentExpiresAt, serverTime]);

  async function pay() {
    if (busy.current || remaining <= 0) return;
    if (onPay) {
      onPay();
      return;
    }
    busy.current = true;
    setPaying(true);
    setError("");
    try {
      const result = await api(`/orders/${order.id}/pay`, decodePayResponse, {
        method: "POST",
      });
      if (alive.current) window.location.assign(result.redirectUrl);
    } catch (reason) {
      if (alive.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Không thể khởi tạo thanh toán. Hãy thử lại.",
        );
        setPaying(false);
      }
      busy.current = false;
    }
  }

  return (
    <div className="order-payment-action">
      <p>
        Thời hạn thanh toán: {formatShowtime(order.paymentExpiresAt, "short")}.
      </p>
      <p role="timer" aria-label="Thời gian thanh toán còn lại">
        Còn {countdownLabel(remaining)}
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={() => void pay()} disabled={paying || remaining <= 0}>
        {paying ? "Đang chuyển đến thanh toán…" : "Thanh toán"}
      </Button>
    </div>
  );
}
