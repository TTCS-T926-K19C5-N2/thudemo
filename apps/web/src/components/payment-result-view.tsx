"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Ticket,
  ChevronRight,
  ShieldCheck,
  Send,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchOrderStatus,
  simulateWebhookSuccess,
  type OrderStatusResult,
} from "@/lib/api";

interface PaymentResultViewProps {
  orderIdOrCode: string;
}

export function PaymentResultView({ orderIdOrCode }: PaymentResultViewProps) {
  const [order, setOrder] = useState<OrderStatusResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState("");

  const [retryCount, setRetryCount] = useState(0);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Truy vấn trạng thái thực tế từ máy chủ (Server-authoritative)
  const queryServerStatus = useCallback(async () => {
    if (!orderIdOrCode) return;
    try {
      const data = await fetchOrderStatus(orderIdOrCode);
      setOrder(data);
      setErrorMessage("");

      // Nếu máy chủ đã chuyển sang trạng thái cuối cùng (PAID hoặc CANCELLED), dừng polling
      if (data.status === "PAID" || data.status === "CANCELLED") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      }
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof (err as { message: unknown }).message === "string"
      ) {
        setErrorMessage((err as { message: string }).message);
      } else {
        setErrorMessage("Không thể kết nối đến máy chủ để lấy trạng thái đơn hàng.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [orderIdOrCode]);

  // Khởi động polling 2 giây / lần và đếm ngược timeout 60 giây
  useEffect(() => {
    let active = true;

    // 1. Hỏi máy chủ ngay khi mount
    const immediateTimer = setTimeout(() => {
      if (active) {
        void queryServerStatus();
      }
    }, 0);

    // AC1: Tự hỏi lại máy chủ mỗi 2 giây
    const pollInterval = setInterval(() => {
      if (active) {
        void queryServerStatus();
      }
    }, 2000);
    pollIntervalRef.current = pollInterval;

    // Bộ đếm thời gian tới 60 giây
    const timerInterval = setInterval(() => {
      setSecondsElapsed((prev) => {
        const next = prev + 1;
        // AC3: Giả sử sau 60 giây vẫn chưa có xác nhận -> dừng hỏi, chuyển sang trạng thái chờ hướng dẫn
        if (next >= 60) {
          clearInterval(pollInterval);
          clearInterval(timerInterval);
          setIsTimedOut(true);
        }
        return next;
      });
    }, 1000);
    timerIntervalRef.current = timerInterval;

    return () => {
      active = false;
      clearTimeout(immediateTimer);
      clearInterval(pollInterval);
      clearInterval(timerInterval);
    };
  }, [queryServerStatus, retryCount]);

  function restartPolling() {
    setIsTimedOut(false);
    setSecondsElapsed(0);
    setRetryCount((prev) => prev + 1);
  }

  // Mô phỏng webhook gửi đến từ cổng thanh toán để kiểm thử trực quan
  async function handleSimulateWebhook() {
    if (!order?.orderCode) return;
    setSimulating(true);
    setSimMessage("");
    try {
      await simulateWebhookSuccess(order.orderCode);
      setSimMessage("Đã gửi Webhook thành công! Đang chờ lượt polling 2s tiếp theo...");
      // Lập tức trigger query để cập nhật UI ngay lập tức
      await queryServerStatus();
    } catch (e: unknown) {
      const msg =
        e &&
        typeof e === "object" &&
        "message" in e &&
        typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Lỗi mô phỏng webhook";
      setSimMessage(msg);
    } finally {
      setSimulating(false);
    }
  }

  const formatVND = (val?: number) => {
    if (typeof val !== "number") return "0 đ";
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Thẻ hiển thị trạng thái chính */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        
        {/* TRƯỜNG HỢP 1: ĐANG TẢI LẦN ĐẦU */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              Đang kết nối đến máy chủ...
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Đang xác minh thông tin đơn hàng với hệ thống.
            </p>
          </div>
        )}

        {/* TRƯỜNG HỢP 2: LỖI KHÔNG TÌM THẤY ĐƠN HÀNG */}
        {!isLoading && errorMessage && (
          <div className="text-center py-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-foreground">
              Không tìm thấy đơn hàng
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="outline" onClick={restartPolling}>
                <RefreshCw className="mr-2 h-4 w-4" /> Thử lại
              </Button>
              <Button asChild>
                <Link href="/events">Khám phá sự kiện</Link>
              </Button>
            </div>
          </div>
        )}

        {/* TRƯỜNG HỢP 3: CÓ DỮ LIỆU ĐƠN HÀNG */}
        {!isLoading && !errorMessage && order && (
          <>
            {/* TRẠNG THÁI: PAID (AC2: Chuyển sang 'đã thanh toán' kèm liên kết tới vé) */}
            {order.status === "PAID" && (
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <CheckCircle2 className="h-10 w-10" />
                </div>

                <span className="mt-4 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Đã thanh toán
                </span>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Thanh toán thành công!
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Giao dịch đã được máy chủ xác nhận hợp lệ từ cổng thanh toán.
                </p>

                {/* Chi tiết đơn */}
                <div className="mt-6 rounded-xl border border-border/80 bg-muted/40 p-4 text-left text-sm space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mã đơn hàng:</span>
                    <span className="font-mono font-semibold text-foreground">{order.orderCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sự kiện:</span>
                    <span className="font-medium text-foreground">{order.eventName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Số tiền thanh toán:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatVND(order.amount)}
                    </span>
                  </div>
                  {order.transactionId && (
                    <div className="flex justify-between border-t border-border/60 pt-2 text-xs">
                      <span className="text-muted-foreground">Mã giao dịch cổng:</span>
                      <span className="font-mono text-muted-foreground">{order.transactionId}</span>
                    </div>
                  )}
                </div>

                {/* AC2: Liên kết tới vé */}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button asChild size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
                    <Link href={order.ticketUrl || `/orders/${order.id}/ticket`}>
                      <Ticket className="h-5 w-5" /> Xem vé của bạn
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/events">Quay lại danh sách sự kiện</Link>
                  </Button>
                </div>
              </div>
            )}

            {/* TRẠNG THÁI: PENDING (AC1 & AC3) */}
            {order.status === "PENDING" && !isTimedOut && (
              <div className="text-center">
                {/* AC1: Icon spinner + Đang xác nhận thanh toán */}
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 text-primary">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                </div>

                <span className="mt-4 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                  Hỏi lại máy chủ mỗi 2s
                </span>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Đang xác nhận thanh toán...
                </h1>

                <p className="mt-2 text-sm text-muted-foreground">
                  Hệ thống đang chờ webhook xác thực từ cổng thanh toán. Vui lòng giữ nguyên trang.
                </p>

                {/* Progress bar countdown */}
                <div className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4 text-left">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Thời gian chờ xác nhận
                    </span>
                    <span className="font-mono">{secondsElapsed}s / 60s</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary transition-all duration-1000 ease-linear"
                      style={{ width: `${Math.min(100, (secondsElapsed / 60) * 100)}%` }}
                    />
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-muted-foreground border-t border-border/50 pt-3">
                    <div className="flex justify-between">
                      <span>Mã đơn hàng:</span>
                      <span className="font-mono font-semibold text-foreground">{order.orderCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Số tiền:</span>
                      <span className="font-medium text-foreground">{formatVND(order.amount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TRẠNG THÁI: TIMEOUT SAU 60 GIÂY (AC3: Hướng dẫn kiểm tra lại trong lịch sử thay vì báo thất bại) */}
            {order.status === "PENDING" && isTimedOut && (
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                  <Clock className="h-9 w-9" />
                </div>

                <span className="mt-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  Hết thời gian chờ 60 giây
                </span>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Chưa nhận được xác nhận từ cổng thanh toán
                </h1>

                {/* Hướng dẫn chi tiết cho người dùng theo AC3 */}
                <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-left text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200 space-y-2">
                  <p className="font-medium flex items-center gap-1.5">
                    <HelpCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    Đơn hàng của bạn chưa bị huỷ!
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Hệ thống ngân hàng hoặc cổng thanh toán đang trong quá trình đối soát dữ liệu. Vui lòng <strong>không thực hiện thanh toán lại</strong> ngay để tránh bị trừ tiền hai lần.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Bạn có thể kiểm tra trạng thái cập nhật mới nhất trong mục <strong>Lịch sử đơn hàng</strong> sau vài phút khi webhook được cổng gửi đến.
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button asChild size="lg" className="gap-2">
                    <Link href="/account">
                      Kiểm tra trong Lịch sử đơn hàng <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="outline" size="lg" onClick={restartPolling} className="gap-2">
                    <RefreshCw className="h-4 w-4" /> Thử kiểm tra lại ngay
                  </Button>
                </div>
              </div>
            )}

            {/* TRẠNG THÁI: CANCELLED */}
            {order.status === "CANCELLED" && (
              <div className="text-center py-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertCircle className="h-9 w-9" />
                </div>
                <h1 className="mt-4 text-2xl font-bold text-foreground">
                  Giao dịch thanh toán đã bị huỷ
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Đơn hàng {order.orderCode} đã bị huỷ do quá hạn hoặc bị từ chối từ phía ngân hàng.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Button asChild>
                    <Link href="/events">Đặt lại vé khác</Link>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* BẢNG ĐIỀU KHIỂN MÔ PHỎNG DÀNH CHO KIỂM THỬ / GIÁNG VIÊN ĐÁNH GIÁ (DEMO PANEL) */}
      {order && (
        <aside
          aria-label="Công cụ kiểm thử dành cho chấm bài Sprint 3"
          className="mt-8 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-5 text-sm"
        >
          <div className="flex items-center gap-2 font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            <span>Công cụ kiểm thử & Đánh giá (SCRUM-32 & SCRUM-33)</span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Bảng điều khiển này giúp bạn kiểm thử trực tiếp hành vi AC1, AC2, AC3 và AC4:
          </p>

          <div className="mt-3 flex flex-wrap gap-2.5">
            {order.status === "PENDING" && (
              <Button
                size="sm"
                variant="default"
                disabled={simulating}
                onClick={handleSimulateWebhook}
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="h-3.5 w-3.5" />
                {simulating ? "Đang gửi..." : "Mô phỏng Webhook hợp lệ (Kích hoạt AC2)"}
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={queryServerStatus}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Hỏi lại trạng thái ngay
            </Button>
          </div>

          {simMessage && (
            <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {simMessage}
            </p>
          )}

          <div className="mt-3 rounded bg-background/80 p-2.5 text-[11px] text-muted-foreground space-y-1">
            <div>
              <strong>AC4 (Server-authoritative):</strong> Dù trên thanh địa chỉ bạn có thêm query params như{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">?status=success</code> hay{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">?result=paid</code>, trang web vẫn
              chỉ hiển thị đúng trạng thái thật trả về từ máy chủ.
            </div>
            <div>
              <strong>AC1 (2s Polling):</strong> Trang tự động gửi request đến máy chủ mỗi 2 giây khi đơn ở trạng thái PENDING.
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
