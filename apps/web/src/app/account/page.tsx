"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CurrentUser, loadCurrentUser } from "@/lib/api";
import { api } from "@/lib/api/client";
import {
  decodeOrdersList,
  decodeResendResponse,
  type OrderDetail,
} from "@/lib/contracts/orders";
import { formatVnd, formatShowtime } from "@/lib/formatting";
import {
  OrganizerLayout,
  PublicLayout,
} from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SessionActions } from "@/components/layout/session-actions";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle,
  CircleAlert,
  Mail,
  RotateCw,
  Ticket as TicketIcon,
} from "@/components/ui/material-icon";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<{
    orderId: string;
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    loadCurrentUser()
      .then((result) => {
        if (!mounted) return;
        if (!result) {
          router.replace("/login");
          return;
        }
        setUser(result);
        if (result.roles.includes("BUYER")) {
          setOrdersLoading(true);
          api("/orders", decodeOrdersList)
            .then((data) => mounted && setOrders(data))
            .catch(() => {})
            .finally(() => mounted && setOrdersLoading(false));
        }
      })
      .catch(
        () =>
          mounted && setError("Không tải được tài khoản. Hãy tải lại trang."),
      )
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleResend(order: OrderDetail) {
    setResendingId(order.id);
    setResendStatus(null);
    try {
      const result = await api(
        `/orders/${order.id}/resend`,
        decodeResendResponse,
        { method: "POST" },
      );
      if (result.emailResult.success) {
        setResendStatus({
          orderId: order.id,
          success: true,
          message: `Đã gửi lại vé thành công tới ${order.customerEmail} (thử ${result.emailResult.attempts} lần). Sử dụng đúng ${order.tickets.length} vé đã có sẵn.`,
        });
      } else {
        setResendStatus({
          orderId: order.id,
          success: false,
          message:
            result.emailResult.error ??
            "Gửi lại email thất bại sau 3 lần thử. Ban quản trị đã ghi nhận để hỗ trợ.",
        });
      }
    } catch (err: unknown) {
      setResendStatus({
        orderId: order.id,
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "Lỗi kết nối khi gửi lại vé. Vui lòng thử lại sau.",
      });
    } finally {
      setResendingId(null);
    }
  }

  const content = (
    <div className="operations-page account-page max-w-4xl mx-auto space-y-6">
      <div className="page-heading">
        <div>
          <h1>Tài khoản</h1>
          <p>Thông tin tài khoản và vé điện tử đã mua.</p>
        </div>
      </div>
      {loading && (
        <div role="status" aria-label="Đang tải tài khoản">
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {error && (
        <section className="operations-panel" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Tải lại trang
          </Button>
        </section>
      )}
      {user && (
        <>
          {!user.roles.includes("ORGANIZER") && (
            <div className="account-mobile-session">
              <SessionActions accountLink={false} />
            </div>
          )}
          <section className="operations-panel">
            <h2>Thông tin tài khoản</h2>
            <dl className="account-facts">
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Vai trò</dt>
                <dd>
                  {user.roles.map((role) => (
                    <Badge key={role} variant="outline">
                      {role === "ORGANIZER"
                        ? "Ban tổ chức"
                        : role === "BUYER"
                          ? "Người mua"
                          : role}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Đăng nhập</dt>
                <dd>Phiên hiện tại đã được xác nhận.</dd>
              </div>
            </dl>
          </section>

          {/* Buyer Ticket List */}
          {user.roles.includes("BUYER") && (
            <section className="operations-panel space-y-4">
              <div className="flex items-center justify-between">
                <h2>Vé điện tử của tôi</h2>
                <Badge variant="secondary">
                  {orders.length} đơn hàng
                </Badge>
              </div>

              {ordersLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : orders.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <TicketIcon size={32} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-slate-600 text-sm">Bạn chưa có vé nào.</p>
                  <Button asChild className="mt-3" variant="outline">
                    <Link href="/">Khám phá sự kiện & Mua vé</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm"
                    >
                      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-mono font-bold text-slate-500 uppercase">
                            Đơn hàng #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                          <h3 className="font-bold text-slate-900 text-base">
                            {order.showtime.event.name}
                          </h3>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-slate-500 block">
                            {formatShowtime(order.showtime.startTime, "short")}
                          </span>
                          <span className="font-bold text-emerald-600 text-sm">
                            {formatVnd(order.totalAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 space-y-4">
                        {/* Resend Status Banner for this order */}
                        {resendStatus?.orderId === order.id && (
                          <Alert
                            className={
                              resendStatus.success
                                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                : "bg-red-50 border-red-200 text-red-900"
                            }
                          >
                            {resendStatus.success ? (
                              <CheckCircle className="text-emerald-600" />
                            ) : (
                              <CircleAlert className="text-red-600" />
                            )}
                            <AlertTitle className="font-semibold text-sm">
                              {resendStatus.success
                                ? "Đã gửi lại vé"
                                : "Lỗi gửi lại vé"}
                            </AlertTitle>
                            <AlertDescription className="text-xs">
                              {resendStatus.message}
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {order.tickets.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 gap-3"
                            >
                              <div className="space-y-1">
                                <div className="text-xs font-mono font-bold text-slate-700">
                                  {t.ticketCode}
                                </div>
                                <div className="text-sm font-semibold text-slate-900">
                                  Hàng {t.seat.row} - Ghế {t.seat.seatNumber}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {t.seat.category.name} · {formatVnd(t.price)}
                                </div>
                              </div>

                              {t.qrCodeImage && (
                                <div className="flex flex-col items-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={t.qrCodeImage}
                                    alt={`QR ${t.ticketCode}`}
                                    className="w-20 h-20 bg-white border border-slate-300 rounded p-1"
                                  />
                                  <span className="text-[10px] text-slate-400 mt-0.5">
                                    Quét vé
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-xs text-slate-500">
                            Email nhận vé: <strong>{order.customerEmail}</strong>
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResend(order)}
                            disabled={resendingId === order.id}
                            className="flex items-center gap-1.5 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
                          >
                            <RotateCw
                              className={
                                resendingId === order.id ? "animate-spin" : ""
                              }
                              size={14}
                            />
                            <Mail size={14} />
                            {resendingId === order.id
                              ? "Đang gửi lại..."
                              : "Gửi lại vé qua email"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="operations-panel">
            <h2>Chức năng của bạn</h2>
            <p>
              {user.roles.includes("ORGANIZER")
                ? "Quản lý sự kiện, suất diễn, sơ đồ ghế và giá vé thuộc quyền của bạn."
                : "Khám phá sự kiện đang mở bán, chọn và giữ ghế."}
            </p>
            <div className="operations-actions">
              <Button asChild>
                <Link href={user.roles.includes("ORGANIZER") ? "/events" : "/"}>
                  {user.roles.includes("ORGANIZER")
                    ? "Quản lý sự kiện"
                    : "Khám phá sự kiện"}
                </Link>
              </Button>
              {user.roles.includes("ORGANIZER") && (
                <Button variant="outline" asChild>
                  <Link href="/">Khám phá sự kiện</Link>
                </Button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
  return user?.roles.includes("ORGANIZER") ? (
    <OrganizerLayout title="Tài khoản" mode="account">
      {content}
    </OrganizerLayout>
  ) : (
    <PublicLayout signedIn={!!user}>{content}</PublicLayout>
  );
}

