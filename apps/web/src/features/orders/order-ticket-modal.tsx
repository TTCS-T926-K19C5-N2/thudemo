"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  CircleAlert,
  Mail,
  RotateCw,
  Ticket as TicketIcon,
  Close,
} from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api } from "@/lib/api/client";
import {
  decodeResendResponse,
  type EmailDeliveryResult,
  type OrderDetail,
} from "@/lib/contracts/orders";
import { formatVnd, formatShowtime } from "@/lib/formatting";

type OrderTicketModalProps = {
  order: OrderDetail;
  initialEmailResult: EmailDeliveryResult;
  onClose: () => void;
};

export function OrderTicketModal({
  order,
  initialEmailResult,
  onClose,
}: OrderTicketModalProps) {
  const [emailResult, setEmailResult] = useState<EmailDeliveryResult>(initialEmailResult);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResendEmail() {
    setResending(true);
    setResendStatus(null);
    setResendError(null);

    try {
      const response = await api(
        `/orders/${order.id}/resend`,
        decodeResendResponse,
        { method: "POST" },
      );

      setEmailResult(response.emailResult);

      if (response.emailResult.success) {
        setResendStatus(
          `Đã gửi lại thành công vé điện tử tới email ${order.customerEmail} (lần thử ${response.emailResult.attempts}). Hệ thống sử dụng đúng vé đã tạo.`,
        );
      } else {
        setResendError(
          response.emailResult.error ??
            "Gửi lại email thất bại sau 3 lần thử. Ban quản trị đã được thông báo để xử lý.",
        );
      }
    } catch (err: unknown) {
      setResendError(
        err instanceof Error
          ? err.message
          : "Có lỗi xảy ra khi yêu cầu gửi lại vé.",
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 relative">
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition"
          >
            <Close size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-full text-white">
              <CheckCircle size={28} />
            </div>
            <div>
              <h2 id="order-modal-title" className="text-xl font-bold">
                Thanh toán thành công!
              </h2>
              <p className="text-blue-100 text-sm">
                Mã đơn hàng: #{order.id.slice(0, 8).toUpperCase()} · {order.tickets.length} vé đã được phát hành
              </p>
            </div>
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {/* Email Notification Status */}
          {emailResult.success ? (
            <Alert className="bg-emerald-50 border-emerald-200 text-emerald-900">
              <Mail className="text-emerald-600" />
              <AlertTitle className="font-semibold text-emerald-800">
                Vé điện tử đã được gửi tới email
              </AlertTitle>
              <AlertDescription className="text-sm text-emerald-700">
                Email chứa đầy đủ thông tin vé và mã QR đã được gửi tới:{" "}
                <strong>{order.customerEmail}</strong> (hoàn tất sau {emailResult.attempts} lần thử).
                Bạn có thể mở email để quét vé tại cổng mà không cần đăng nhập.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle className="font-semibold">
                Gửi email thất bại sau {emailResult.attempts} lần thử
              </AlertTitle>
              <AlertDescription className="text-sm">
                {emailResult.error ?? "Không thể kết nối đến máy chủ thư điện tử."}
                <div className="mt-2 text-xs opacity-90">
                  Lỗi đã được ghi nhận trong hệ thống để quản trị xử lý tay. Bạn vẫn có thể sử dụng các mã QR bên dưới hoặc bấm nút <strong>Gửi lại vé</strong>.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Resend Status Banner */}
          {resendStatus && (
            <Alert className="bg-blue-50 border-blue-200 text-blue-900">
              <CheckCircle className="text-blue-600" />
              <AlertTitle className="font-semibold text-blue-800">Gửi lại vé thành công</AlertTitle>
              <AlertDescription className="text-sm">{resendStatus}</AlertDescription>
            </Alert>
          )}
          {resendError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle className="font-semibold">Lỗi gửi lại vé</AlertTitle>
              <AlertDescription className="text-sm">{resendError}</AlertDescription>
            </Alert>
          )}

          {/* Event Context Info */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <h3 className="font-bold text-slate-900 text-base mb-1">
              {order.showtime.event.name}
            </h3>
            <div className="text-xs text-slate-600 space-y-1">
              <div>
                📅 <strong>Thời gian:</strong> {formatShowtime(order.showtime.startTime)}
              </div>
              <div>
                📍 <strong>Địa điểm:</strong> {order.showtime.event.location}
              </div>
              <div>
                💰 <strong>Tổng thanh toán:</strong>{" "}
                <span className="font-bold text-emerald-700 text-sm">
                  {formatVnd(order.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Ticket list with QR codes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                <TicketIcon size={18} /> Danh sách vé điện tử ({order.tickets.length})
              </h4>
              <Badge variant="outline" className="text-xs">
                Có mã QR check-in
              </Badge>
            </div>

            <div className="space-y-4">
              {order.tickets.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white rounded-lg border border-slate-200 shadow-sm gap-4"
                >
                  <div className="space-y-1 text-center sm:text-left flex-1">
                    <span className="text-xs uppercase font-mono tracking-wider text-slate-400">
                      Mã vé
                    </span>
                    <div className="text-base font-bold font-mono text-slate-900">
                      {t.ticketCode}
                    </div>
                    <div className="text-sm font-medium text-slate-800">
                      Hàng {t.seat.row} — Ghế {t.seat.seatNumber} ({t.seat.category.name})
                    </div>
                    <div className="text-xs font-semibold text-blue-600">
                      Giá vé: {formatVnd(t.price)}
                    </div>
                  </div>

                  {t.qrCodeImage && (
                    <div className="flex flex-col items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.qrCodeImage}
                        alt={`Mã QR vé ${t.ticketCode}`}
                        className="w-32 h-32 border border-slate-300 rounded p-1 bg-white shadow-sm"
                      />
                      <span className="text-[11px] text-slate-500 mt-1">
                        Quét tại cửa soát vé
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={handleResendEmail}
            disabled={resending}
            className="flex items-center gap-2 text-sm text-blue-700 border-blue-300 hover:bg-blue-50"
          >
            <RotateCw className={resending ? "animate-spin" : ""} size={16} />
            {resending ? "Đang gửi lại vé..." : "Gửi lại vé qua email"}
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/account">Vé của tôi</Link>
            </Button>
            <Button onClick={onClose}>Đóng</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
