"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Banknote, Clock3, Ticket } from "@/components/ui/material-icon";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import {
  decodeOrderResponse,
  type OrderResponse,
} from "@/lib/contracts/orders";
import { formatShowtime, formatVnd } from "@/lib/formatting";
import {
  countdownLabel,
  remainingSeconds,
  type ServerClock,
} from "@/features/seat-selection/server-countdown";

export function OrderSummary({ id }: { id: string }) {
  const [data, setData] = useState<OrderResponse | null>(null);
  const [clock, setClock] = useState<ServerClock | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await api(`/orders/${id}`, decodeOrderResponse);
    const anchor = {
      serverMs: Date.parse(result.serverTime),
      receivedAt: performance.now(),
    };
    setData(result);
    setClock(anchor);
    setRemaining(
      result.order.status === "PENDING_PAYMENT"
        ? remainingSeconds(
            result.order.paymentExpiresAt,
            anchor,
            anchor.receivedAt,
          )
        : 0,
    );
    setError("");
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial order fetch synchronizes server state on mount
    void load().catch((reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Không tải được đơn hàng. Hãy thử lại.",
      ),
    );
  }, [load]);

  useEffect(() => {
    if (!data || !clock || data.order.status !== "PENDING_PAYMENT") return;
    let refreshing = false;
    const timer = setInterval(() => {
      const next = remainingSeconds(
        data.order.paymentExpiresAt,
        clock,
        performance.now(),
      );
      setRemaining(next);
      if (next === 0 && !refreshing) {
        refreshing = true;
        void load()
          .catch((reason) =>
            setError(
              reason instanceof Error
                ? reason.message
                : "Không cập nhật được trạng thái đơn hàng.",
            ),
          )
          .finally(() => {
            refreshing = false;
          });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [clock, data, load]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
          <Button variant="outline" onClick={() => void load()}>
            Thử lại
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!data) return <Skeleton className="h-80 w-full" />;

  const { order } = data;
  const pending = order.status === "PENDING_PAYMENT" && remaining > 0;
  return (
    <div className="order-page">
      <header className="order-heading">
        <div>
          <p className="order-eyebrow">
            <Ticket /> Đơn hàng của bạn
          </p>
          <h1>{pending ? "Đơn chờ thanh toán" : "Đơn đã hết hạn"}</h1>
          <p>
            {order.showtime.event.name} · {formatShowtime(order.showtime.startTime)}
          </p>
        </div>
        <Badge variant={pending ? "secondary" : "outline"}>
          {pending ? "Chờ thanh toán" : "Đã hết hạn"}
        </Badge>
      </header>

      <div className="order-layout">
        <section className="product-panel order-items">
          <h2>Ghế trong đơn ({order.items.length})</h2>
          {order.items.map((item) => (
            <div className="order-item" key={item.seatId}>
              <span>
                <strong>
                  Ghế {item.row}-{item.seatNumber}
                </strong>
                <small>Hạng {item.categoryName}</small>
              </span>
              <strong>{formatVnd(item.unitPrice)}</strong>
            </div>
          ))}
        </section>

        <aside className="product-panel order-payment">
          <h2>Tóm tắt thanh toán</h2>
          <div className={`order-deadline ${pending ? "" : "is-expired"}`}>
            <Clock3 />
            <span>
              <small>Thời gian thanh toán còn lại</small>
              <strong>{pending ? countdownLabel(remaining) : "00:00"}</strong>
            </span>
          </div>
          <p>Giá trong đơn được giữ nguyên từ thời điểm đặt vé.</p>
          <Separator />
          <div className="order-total">
            <span>
              <Banknote /> Tổng tiền
            </span>
            <strong>{formatVnd(Number(order.totalAmount))}</strong>
          </div>
          {!pending && (
            <Alert variant="destructive">
              <AlertDescription>
                Thời hạn thanh toán đã hết; các ghế không còn được giữ cho đơn
                này.
              </AlertDescription>
            </Alert>
          )}
          <Button disabled>Thanh toán</Button>
          <small>Cổng thanh toán chưa nằm trong phạm vi S-16.</small>
          <Link href={`/shows/${order.showtime.id}/seats`}>
            Quay lại sơ đồ ghế
          </Link>
        </aside>
      </div>
    </div>
  );
}
