"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, object } from "@/lib/api/client";

type Conversion = {
  startedSessions: number;
  orderCreatedSessions: number;
  paidSessions: number;
  expiredSessions: number;
  cancelledSessions: number;
  pendingAtCutoff: number;
  from: string;
  to: string;
  cutoff: string;
  generatedAt: string;
  dataAvailableFrom: string | null;
  holdToOrder: { meanSeconds: number | null; p90Seconds: number | null };
  holdToPaid: { meanSeconds: number | null; p90Seconds: number | null };
};

function decode(value: unknown): Conversion {
  const data = object(value);
  const duration = (raw: unknown) => {
    const item = object(raw);
    for (const key of ["meanSeconds", "p90Seconds"])
      if (item[key] !== null && (typeof item[key] !== "number" || !Number.isFinite(item[key])))
        throw new Error("Dữ liệu thời gian giữ không hợp lệ.");
    return { meanSeconds: item.meanSeconds as number | null, p90Seconds: item.p90Seconds as number | null };
  };
  for (const key of ["startedSessions", "orderCreatedSessions", "paidSessions", "expiredSessions", "cancelledSessions", "pendingAtCutoff"])
    if (!Number.isSafeInteger(data[key]) || Number(data[key]) < 0) throw new Error("Dữ liệu lượt giữ không hợp lệ.");
  if (typeof data.from !== "string" || typeof data.to !== "string" || typeof data.cutoff !== "string" || typeof data.generatedAt !== "string") throw new Error("Khoảng cohort không hợp lệ.");
  return {
    startedSessions: Number(data.startedSessions), orderCreatedSessions: Number(data.orderCreatedSessions),
    paidSessions: Number(data.paidSessions), expiredSessions: Number(data.expiredSessions),
    cancelledSessions: Number(data.cancelledSessions),
    pendingAtCutoff: Number(data.pendingAtCutoff), from: data.from, to: data.to,
    cutoff: data.cutoff, generatedAt: data.generatedAt,
    dataAvailableFrom: typeof data.dataAvailableFrom === "string" ? data.dataAvailableFrom : null,
    holdToOrder: duration(data.holdToOrder), holdToPaid: duration(data.holdToPaid),
  };
}

const localDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
const seconds = (value: number | null) => value === null ? "Chưa có mẫu" : `${Math.round(value).toLocaleString("vi-VN")} giây`;

export function HoldConversionReport({ showtimeId }: { showtimeId: string }) {
  const now = new Date();
  const [from, setFrom] = useState(localDate(new Date(now.getTime() - 30 * 86400000)));
  const [to, setTo] = useState(localDate(now));
  const [report, setReport] = useState<Conversion | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError("");
    try {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      const data = await api(`/showtimes/${showtimeId}/hold-conversion-report?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end.toISOString())}`, decode);
      setReport(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không tải được báo cáo giữ chỗ."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby="hold-conversion-title">
    <div><h3 id="hold-conversion-title" className="font-semibold">Chuyển đổi lượt giữ chỗ</h3>
      <p className="text-sm text-muted-foreground">Cohort A theo thời điểm bắt đầu lượt giữ; thống kê đến hết ngày kết thúc (UTC lưu trữ).</p></div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label className="text-sm">Từ ngày<input className="mt-1 block rounded-md border bg-background p-2" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
      <label className="text-sm">Đến ngày<input className="mt-1 block rounded-md border bg-background p-2" type="date" value={to} onChange={(e) => setTo(e.target.value)} required /></label>
      <Button type="submit" disabled={busy}>{busy ? "Đang tải…" : "Xem báo cáo"}</Button>
    </form>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {report && <div className="space-y-2" aria-live="polite">
      <p className="text-sm">Bắt đầu: {report.startedSessions} · Thành đơn: {report.orderCreatedSessions} · Đã trả: {report.paidSessions} · Hết hạn: {report.expiredSessions} · Đã hủy: {report.cancelledSessions} · Đang giữ tại cutoff: {report.pendingAtCutoff}</p>
      <p className="text-sm">Giữ → thành đơn: trung bình {seconds(report.holdToOrder.meanSeconds)}, p90 {seconds(report.holdToOrder.p90Seconds)}.</p>
      <p className="text-sm">Giữ → đã trả: trung bình {seconds(report.holdToPaid.meanSeconds)}, p90 {seconds(report.holdToPaid.p90Seconds)}.</p>
      <p className="text-xs text-muted-foreground">Cutoff: {new Date(report.cutoff).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · cập nhật lúc {new Date(report.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.</p>
      <p className="text-xs text-muted-foreground">Dữ liệu giữ có từ {report.dataAvailableFrom ? new Date(report.dataAvailableFrom).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "chưa có dữ liệu"}; thời lượng tính bằng giây, tập rỗng hiển thị “Chưa có mẫu”.</p>
    </div>}
  </section>;
}
