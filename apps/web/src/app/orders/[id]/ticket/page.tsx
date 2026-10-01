"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Ticket, Calendar, MapPin, CheckCircle2, ArrowLeft, QrCode } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { fetchOrderStatus, type OrderStatusResult } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TicketPage({ params }: PageProps) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchOrderStatus(id)
      .then((data) => {
        if (!mounted) return;
        setOrder(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || "Không thể tải thông tin vé.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <>
      <WorkspaceHeader />
      <main className="min-h-[calc(100vh-57px)] bg-muted/20 py-8 px-4 sm:px-6">
        <div className="mx-auto max-w-xl">
          <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground hover:text-foreground">
            <Link href={`/orders/${id}/result`}>
              <ArrowLeft className="h-4 w-4" /> Quay lại trạng thái đơn
            </Link>
          </Button>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-sm text-muted-foreground">Đang tải vé điện tử...</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}

          {!loading && !error && order && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              {/* Ticket Header */}
              <div className="bg-primary px-6 py-5 text-primary-foreground">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ticket className="h-6 w-6" />
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-90">Vé Điện Tử Hợp Lệ</span>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {order.status === "PAID" ? "ĐÃ THANH TOÁN" : order.status}
                  </span>
                </div>
                <h1 className="mt-3 text-xl font-bold tracking-tight">{order.eventName}</h1>
              </div>

              {/* Ticket Body */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Mã đơn hàng</span>
                    <p className="font-mono font-semibold text-foreground">{order.orderCode}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Giá vé</span>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(order.amount)}
                    </p>
                  </div>
                </div>

                <div className="border-t border-border/80 pt-4 space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>Thời gian giao dịch: {new Date(order.updatedAt).toLocaleString("vi-VN")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>Địa điểm: Xem chi tiết sự kiện đã đăng ký</span>
                  </div>
                </div>

                {/* QR Code section */}
                <div className="border-t border-dashed border-border pt-6 text-center">
                  <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-xl border-2 border-border bg-white p-2 shadow-inner">
                    <QrCode className="h-28 w-28 text-foreground" />
                  </div>
                  <p className="mt-2 text-xs font-mono text-muted-foreground">Mã soát vé: {order.orderCode}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Xuất trình mã này tại quầy check-in của sự kiện để nhận vé vào cổng.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-border bg-muted/30 px-6 py-4 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Hệ thống phân phối vé TTCS</span>
                <Button asChild size="sm" variant="outline">
                  <Link href="/account">Về trang tài khoản</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
