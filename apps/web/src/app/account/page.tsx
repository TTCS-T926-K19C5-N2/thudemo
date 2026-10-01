"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CurrentUser,
  loadCurrentUser,
  fetchOrderHistory,
  createDemoOrder,
  type OrderStatusResult,
} from "@/lib/api";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, ExternalLink, Ticket, Clock, CheckCircle2 } from "lucide-react";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [orders, setOrders] = useState<OrderStatusResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadCurrentUser(),
      fetchOrderHistory().catch(() => []),
    ])
      .then(([userData, ordersData]) => {
        if (!mounted) return;
        if (!userData) router.replace("/login");
        else {
          setUser(userData);
          setOrders(ordersData);
        }
      })
      .catch(() => mounted && setError("Không tải được tài khoản. Hãy tải lại trang."))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleCreateTestOrder() {
    setCreatingOrder(true);
    try {
      const newOrder = await createDemoOrder(200000);
      router.push(`/orders/${newOrder.id}/result`);
    } catch {
      alert("Không tạo được đơn hàng thử nghiệm.");
    } finally {
      setCreatingOrder(false);
    }
  }

  return (
    <>
      <WorkspaceHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-8">
        <h1 className="text-2xl font-semibold">Tài khoản & Quản lý</h1>

        {loading && <p role="status" className="mt-8 text-sm text-muted-foreground">Đang tải thông tin…</p>}
        {error && <p role="alert" className="mt-8 text-sm text-destructive">{error}</p>}

        {user && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Thông tin cá nhân</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Email:</span> <span className="font-medium text-foreground">{user.email}</span></p>
              <p><span className="text-muted-foreground">Vai trò:</span> <span className="font-medium text-foreground">{user.roles.join(", ") || "Chưa được cấp"}</span></p>
            </div>
            {user.roles.includes("ORGANIZER") && (
              <div className="mt-4 pt-4 border-t border-border">
                <Link href="/events" className="font-medium text-primary underline-offset-4 hover:underline">
                  → Quản lý sự kiện của tôi
                </Link>
              </div>
            )}
          </div>
        )}

        {/* LỊCH SỬ ĐƠN HÀNG (AC3) */}
        {!loading && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Lịch sử đơn hàng & Vé đã mua</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Theo dõi trạng thái xác thực thanh toán từ cổng thanh toán (SCRUM-33 AC3)
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={creatingOrder}
                onClick={handleCreateTestOrder}
                className="gap-1.5 text-xs"
              >
                <PlusCircle className="h-4 w-4" />
                {creatingOrder ? "Đang tạo..." : "Tạo đơn thử nghiệm (Demo thanh toán)"}
              </Button>
            </div>

            {orders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                <p>Bạn chưa có đơn hàng nào.</p>
                <p className="text-xs mt-1">Bấm nút trên để tạo đơn hàng thử nghiệm và kiểm tra luồng thanh toán.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-2.5 font-medium">Mã đơn</th>
                      <th className="py-2.5 font-medium">Sự kiện</th>
                      <th className="py-2.5 font-medium">Số tiền</th>
                      <th className="py-2.5 font-medium">Trạng thái</th>
                      <th className="py-2.5 font-medium text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="py-3 font-mono font-medium text-foreground">{o.orderCode}</td>
                        <td className="py-3 text-muted-foreground">{o.eventName || "Vé sự kiện"}</td>
                        <td className="py-3 font-medium">
                          {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(o.amount)}
                        </td>
                        <td className="py-3">
                          {o.status === "PAID" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> ĐÃ THANH TOÁN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              <Clock className="h-3 w-3" /> {o.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Link
                              href={`/orders/${o.id}/result`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              Trạng thái <ExternalLink className="h-3 w-3" />
                            </Link>
                            {o.status === "PAID" && (
                              <Link
                                href={`/orders/${o.id}/ticket`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
                              >
                                Xem vé <Ticket className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

