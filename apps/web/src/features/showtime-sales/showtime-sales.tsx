"use client";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api/client";
import {
  decodeShowtimeSales,
  type SalesFigures,
  type ShowtimeSales,
} from "@/lib/contracts/showtimes";
import { formatVnd } from "@/lib/formatting";

// S-50 AC: figures lag at most one minute. Refresh twice a minute and when
// the organizer comes back to the tab.
export const SALES_REFRESH_MS = 30_000;

const number = (value: number) => value.toLocaleString("vi-VN");
const updatedAt = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));

export function soldShare({ sold, totalSeats }: SalesFigures): string {
  return totalSeats === 0 ? "0%" : `${Math.round((sold / totalSeats) * 100)}%`;
}

function Figures({ row }: { row: SalesFigures }) {
  return (
    <>
      <TableCell className="text-right">{number(row.totalSeats)}</TableCell>
      <TableCell className="text-right">
        {number(row.sold)}{" "}
        <span className="text-muted-foreground text-xs">({soldShare(row)})</span>
      </TableCell>
      <TableCell className="text-right">{number(row.held)}</TableCell>
      <TableCell className="text-right">{number(row.available)}</TableCell>
      <TableCell className="text-right font-medium">{formatVnd(row.revenue)}</TableCell>
    </>
  );
}

export function ShowtimeSalesReport({
  id,
  refreshSignal = 0,
}: {
  id: string;
  // Bumped by the page's "Làm mới" button to reload immediately.
  refreshSignal?: number;
}) {
  const [sales, setSales] = useState<ShowtimeSales | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const next = await api(`/showtimes/${id}/manage/sales`, decodeShowtimeSales, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setSales(next);
        setError("");
      } catch (reason: unknown) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Không tải được số liệu.");
      } finally {
        loading = false;
      }
    }
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const timer = window.setInterval(visible, SALES_REFRESH_MS);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    };
  }, [id, retry, refreshSignal]);

  if (!sales) {
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
          <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
            Thử lại
          </Button>
        </AlertDescription>
      </Alert>
    ) : (
      <Skeleton className="h-64 w-full" aria-label="Đang tải số liệu bán vé" />
    );
  }

  const { totals } = sales;
  return (
    <section className="space-y-4" data-testid="showtime-sales">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Đã bán", value: `${number(totals.sold)} / ${number(totals.totalSeats)}` },
          { label: "Đang giữ", value: number(totals.held) },
          { label: "Còn trống", value: number(totals.available) },
          { label: "Doanh thu", value: formatVnd(totals.revenue) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <span className="block text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <strong className="text-xl">{value}</strong>
          </div>
        ))}
      </div>

      {error && (
        // Keep showing the last figures; say they may be stale.
        <Alert variant="destructive">
          <AlertDescription>
            Không cập nhật được số liệu mới: {error}. Đang hiển thị số liệu lúc{" "}
            {updatedAt(sales.generatedAt)}.
          </AlertDescription>
        </Alert>
      )}

      {sales.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Suất diễn chưa có sơ đồ ghế nên chưa có số liệu bán vé.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hạng ghế</TableHead>
                <TableHead className="text-right">Giá hiện tại</TableHead>
                <TableHead className="text-right">Tổng ghế</TableHead>
                <TableHead className="text-right">Đã bán</TableHead>
                <TableHead className="text-right">Đang giữ</TableHead>
                <TableHead className="text-right">Còn trống</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.categories.map((c) => (
                <TableRow key={c.name} data-testid={`sales-row-${c.name}`}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right">{formatVnd(c.price)}</TableCell>
                  <Figures row={c} />
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Tổng</TableCell>
                <TableCell />
                <Figures row={totals} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Cập nhật lúc {updatedAt(sales.generatedAt)} · tự động làm mới mỗi 30 giây. Doanh
        thu tính theo giá lúc khách mua của các đơn đã thanh toán; đơn thanh toán muộn
        đang chờ xử lý chưa được tính.
      </p>
    </section>
  );
}
