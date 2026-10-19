"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, object } from "@/lib/api/client";
import type { OwnedShowtime } from "@/lib/contracts/showtimes";
import { formatVnd, formatShowtime } from "@/lib/formatting";
import { CheckCircle, CircleAlert } from "@/components/ui/material-icon";
export function SaleStatusControl({
  show,
  onChanged,
}: {
  show: OwnedShowtime;
  onChanged: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const missing = show.categories.filter((c) => c.price === null);
  const reason = !show._count.seats
    ? "Chưa có sơ đồ ghế."
    : missing.length
      ? `Chưa đặt giá: ${missing.map((c) => c.name).join(", ")}.`
      : "";
  async function toggle() {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await api(`/showtimes/${show.id}/status`, object, {
        method: "PATCH",
        body: { status: show.status === "ON_SALE" ? "CLOSED" : "ON_SALE" },
      });
      await onChanged();
      setMessage(show.status === "ON_SALE" ? "Đã đóng bán." : "Đã mở bán.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thay đổi được trạng thái.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="sale-status-control">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <p role="status" className="product-success">
          {message}
        </p>
      )}
      <section className="product-panel sale-summary">
        <h2>{formatShowtime(show.startTime, "full")}</h2>
        <div className="form-actions">
          <strong>
            Trạng thái:{" "}
            {show.status === "ON_SALE"
              ? "Đang bán"
              : show.status === "CLOSED"
                ? "Đã đóng"
                : "Nháp"}
          </strong>
          <Button
            disabled={pending || (show.status !== "ON_SALE" && !!reason)}
            onClick={toggle}
          >
            {pending
              ? "Đang cập nhật…"
              : show.status === "ON_SALE"
                ? "Đóng bán"
                : "Mở bán"}
          </Button>
        </div>
        {reason && <p>{reason}</p>}
        <div className="showtime-facts">
          <div>
            Địa điểm
            <strong>{show.event.location}</strong>
            <small>
              {show._count.seats.toLocaleString("vi-VN")} ghế ·{" "}
              {show.categories.length} phân khu
            </small>
          </div>
          <div>
            Khoảng giá
            <strong>
              {formatVnd(
                show.categories.length && missing.length === 0
                  ? Math.min(...show.categories.map((c) => c.price ?? 0))
                  : null,
              )}
              {show.categories.length > 0 && missing.length === 0
                ? ` – ${formatVnd(Math.max(...show.categories.map((c) => c.price ?? 0)))}`
                : ""}
            </strong>
          </div>
        </div>
      </section>
      <section className="product-panel">
        <h2>Kiểm tra điều kiện mở bán</h2>
        <div className="readiness-line">
          {show._count.seats ? <CheckCircle /> : <CircleAlert />}
          <div>
            <strong>Có sơ đồ ghế</strong>
            <p>
              {show._count.seats.toLocaleString("vi-VN")} ghế ·{" "}
              {show.categories.length} phân khu
            </p>
          </div>
        </div>
        <div className="readiness-line">
          {missing.length || !show.categories.length ? (
            <CircleAlert />
          ) : (
            <CheckCircle />
          )}
          <div>
            <strong>Đã đặt giá cho mọi hạng</strong>
            <p>
              {missing.length || !show.categories.length
                ? "Cần hoàn tất đơn giá trước khi mở bán."
                : show.categories
                    .map((c) => `${c.name}: ${formatVnd(c.price)}`)
                    .join(" · ")}
            </p>
          </div>
        </div>
        <p className="readonly-notice">
          Sau khi mở bán lần đầu, cấu trúc sơ đồ không thể sửa.
        </p>
      </section>
    </div>
  );
}
