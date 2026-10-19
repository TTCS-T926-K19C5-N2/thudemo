"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckCircle, CircleAlert } from "@/components/ui/material-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { decodeOrder, type OrderResult } from "@/lib/contracts/orders";
import { formatShowtime } from "@/lib/formatting";

export function OrderStatus({ id }: { id: string }) {
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loading = false;
    async function refresh() {
      if (loading || controller.signal.aborted) return;
      loading = true;
      clearTimeout(timer);
      const startedAt = performance.now();
      try {
        const next = await api(`/orders/${id}`, decodeOrder, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setResult(next);
        setError("");
        if (next.order.status === "PENDING_PAYMENT") {
          const delay =
            Date.parse(next.order.paymentExpiresAt) -
            Date.parse(next.serverTime) -
            (performance.now() - startedAt);
          // At the deadline, ask the server again; never infer payment/expiry locally.
          timer = setTimeout(
            () => void refresh(),
            Math.max(250, Math.min(delay + 100, 2147483647)),
          );
        }
      } catch (reason: unknown) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Không tải được đơn hàng.",
          );
      } finally {
        loading = false;
      }
    }
    const reconnect = () => void refresh();
    const visible = () => {
      if (document.visibilityState === "visible") reconnect();
    };
    void refresh();
    window.addEventListener("focus", reconnect);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", reconnect);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id, retry]);

  if (error)
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertDescription>
          {error}
          <Button
            variant="outline"
            onClick={() => setRetry((value) => value + 1)}
          >
            Thử lại
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!result || result.order.id !== id)
    return <Skeleton className="h-48 w-full" aria-label="Đang tải đơn hàng" />;

  const pending = result.order.status === "PENDING_PAYMENT";
  return (
    <section className="operations-panel" role="status">
      <h2>
        {pending ? <CheckCircle /> : <CircleAlert />}{" "}
        {pending ? "Tạo đơn thành công" : "Đơn không còn chờ thanh toán"}
      </h2>
      <p>
        Mã đơn: <strong>{result.order.id}</strong>
      </p>
      <p>
        {pending
          ? `Ghế được giữ đến ${formatShowtime(result.order.paymentExpiresAt, "short")}.`
          : result.order.status === "PAID"
            ? "Đơn hàng đã được thanh toán."
            : result.order.status === "CANCELLED"
              ? "Đơn hàng đã được hủy."
              : "Thời hạn giữ chỗ của đơn đã kết thúc."}
      </p>
      <Button asChild>
        <Link href="/">Đến danh sách sự kiện</Link>
      </Button>
    </section>
  );
}
