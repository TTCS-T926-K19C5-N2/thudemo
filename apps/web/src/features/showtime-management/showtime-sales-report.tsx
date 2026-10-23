"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, object } from "@/lib/api/client";
import {
  decodeShowtimeSales,
  type SalesFigures,
  type ShowtimeSales,
} from "@/lib/contracts/showtimes";
import { formatVnd } from "@/lib/formatting";
import { HoldConversionReport } from "./hold-conversion-report";

const REFRESH_INTERVAL_MS = 30_000;
const number = (value: number) => value.toLocaleString("vi-VN");

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold text-foreground">{value}</dd>
    </div>
  );
}

export function ShowtimeSalesReport({
  id,
  refreshSignal = 0,
}: {
  id: string;
  refreshSignal?: number;
}) {
  const [report, setReport] = useState<ShowtimeSales | null>(null);
  const [attendance, setAttendance] = useState<{
    totalTickets: number;
    checkedInTickets: number;
    generatedAt: string;
  } | null>(null);
  const [attendanceError, setAttendanceError] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const next = await api(
          `/showtimes/${id}/manage/sales`,
          decodeShowtimeSales,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setReport(next);
        setError("");
        if (next.isDemo) {
          setAttendance(null);
          setAttendanceError("");
        } else {
          try {
            const currentAttendance = await api(
              `/scanner/showtimes/${id}/attendance`,
              (value: unknown) => {
                const data = object(value);
                if (
                  typeof data.showtimeId !== "string" ||
                  data.showtimeId !== id ||
                  !Number.isSafeInteger(data.totalTickets) ||
                  Number(data.totalTickets) < 0 ||
                  !Number.isSafeInteger(data.checkedInTickets) ||
                  Number(data.checkedInTickets) < 0 ||
                  typeof data.generatedAt !== "string" ||
                  Number.isNaN(Date.parse(data.generatedAt))
                )
                  throw new Error("Dữ liệu lượt vào cửa không hợp lệ.");
                return {
                  totalTickets: Number(data.totalTickets),
                  checkedInTickets: Number(data.checkedInTickets),
                  generatedAt: data.generatedAt,
                };
              },
              { signal: controller.signal },
            );
            if (controller.signal.aborted) return;
            setAttendance(currentAttendance);
            setAttendanceError("");
          } catch (reason) {
            if (!controller.signal.aborted)
              setAttendanceError(
                reason instanceof Error
                  ? reason.message
                  : "Không tải được số khách đã vào.",
              );
          }
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Không tải được số liệu bán vé.",
          );
      } finally {
        loading = false;
      }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const timer = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [id, refreshSignal, retry]);

  if (!report)
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>
          {error}{" "}
          <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
            Thử lại
          </Button>
        </AlertDescription>
      </Alert>
    ) : (
      <Skeleton className="h-64 w-full" aria-label="Đang tải số liệu bán vé" />
    );

  const totals = report.totals;
  const updatedAt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(report.generatedAt));

  return (
    <section className="space-y-4" aria-labelledby="showtime-sales-title">
      <div>
        <h2 id="showtime-sales-title" className="text-xl font-semibold">
          Doanh thu và tồn vé
        </h2>
        <p className="text-sm text-muted-foreground">
          Số liệu cập nhật lúc {updatedAt}; trang tự làm mới mỗi 30 giây.
        </p>
      </div>
      {report.isDemo && (
        <Alert>
          <AlertDescription>
            Đây là suất demo. Sơ đồ ghế chỉ để xem; số liệu bên dưới không phải
            doanh thu hay tình trạng bán vé thật.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Không cập nhật được số liệu mới: {error}. Đang hiển thị lần đọc lúc{" "}
            {updatedAt}.
          </AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric
          label="Đã bán / tổng ghế"
          value={`${number(totals.sold)} / ${number(totals.totalSeats)}`}
        />
        <Metric label="Đang giữ" value={number(totals.held)} />
        <Metric label="Còn trống" value={number(totals.available)} />
        <Metric label="Doanh thu đã thanh toán" value={formatVnd(totals.revenue)} />
        {!report.isDemo && attendance && (
          <Metric
            label="Khách đã vào / tổng vé"
            value={`${number(attendance.checkedInTickets)} / ${number(attendance.totalTickets)}`}
          />
        )}
      </dl>
      {!report.isDemo && attendanceError && (
        <Alert variant="destructive">
          <AlertDescription>
            Không tải được số khách đã vào: {attendanceError}. Các số liệu bán vé
            phía trên vẫn được cập nhật riêng.
          </AlertDescription>
        </Alert>
      )}
      {report.categories.length === 0 ? (
        <p className="readonly-notice">
          Suất diễn chưa có sơ đồ ghế nên chưa có số liệu bán vé.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
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
              {report.categories.map((category) => (
                <TableRow key={category.name}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-right">
                    {formatVnd(category.price)}
                  </TableCell>
                  <Figures row={category} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Doanh thu tính theo giá đã lưu trên các đơn PAID; đơn thanh toán muộn
        đang chờ xử lý chưa được tính. Số khách vào cửa được tổng hợp từ vé đã
        soát và tự làm mới cùng báo cáo.
      </p>
      {!report.isDemo && <HoldConversionReport showtimeId={id} />}
    </section>
  );
}

function Figures({ row }: { row: SalesFigures }) {
  return (
    <>
      <TableCell className="text-right">{number(row.totalSeats)}</TableCell>
      <TableCell className="text-right">{number(row.sold)}</TableCell>
      <TableCell className="text-right">{number(row.held)}</TableCell>
      <TableCell className="text-right">{number(row.available)}</TableCell>
      <TableCell className="text-right font-medium">
        {formatVnd(row.revenue)}
      </TableCell>
    </>
  );
}
