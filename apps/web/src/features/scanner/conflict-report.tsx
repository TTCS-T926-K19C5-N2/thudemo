"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, object } from "@/lib/api/client";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
type Conflict = {
  scanId: string;
  ticketCode: string;
  gateName: string | null;
  scannedAt: string;
  winningGate: string | null;
  winningTime: string | null;
  deviceId: string;
  receivedAt: string;
  clockOffsetMs: number | null;
  winningClockOffsetMs: number | null;
};
type View = {
  conflicts: Conflict[];
  pagination: { page: number; total: number; hasNext: boolean };
};
function decode(value: unknown): View {
  const data = object(value),
    pagination = object(data.pagination);
  if (
    !Array.isArray(data.conflicts) ||
    typeof pagination.page !== "number" ||
    typeof pagination.total !== "number" ||
    typeof pagination.hasNext !== "boolean"
  )
    throw Error("Không đọc được báo cáo xung đột.");
  const conflicts = data.conflicts.map((raw) => {
    const row = object(raw);
    for (const key of [
      "scanId",
      "ticketCode",
      "scannedAt",
      "deviceId",
      "receivedAt",
    ])
      if (typeof row[key] !== "string")
        throw Error("Báo cáo chưa đủ thông tin truy vết.");
    for (const key of ["gateName", "winningGate", "winningTime"])
      if (row[key] !== null && typeof row[key] !== "string")
        throw Error("Thông tin cửa/thời điểm không hợp lệ.");
    for (const key of ["clockOffsetMs", "winningClockOffsetMs"])
      if (
        row[key] !== null &&
        (typeof row[key] !== "number" || !Number.isFinite(row[key]))
      )
        throw Error("Thông tin đồng hồ không hợp lệ.");
    return row as Conflict;
  });
  return {
    conflicts,
    pagination: {
      page: pagination.page,
      total: pagination.total,
      hasNext: pagination.hasNext,
    },
  };
}
function when(value: string | null) {
  return value
    ? new Date(value).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
      })
    : "Chưa có lần vào được tính";
}
const offset = (value: number | null) =>
  value === null ? "Lần online / chưa đo" : `${Math.round(value)} ms`;
export function ConflictReport({ showtimeId }: { showtimeId: string }) {
  const [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [view, setView] = useState<View | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void api(
      `/scanner/showtimes/${showtimeId}/conflicts?page=${page}`,
      decode,
      { signal: abort.signal },
    )
      .then((result) => {
        if (!abort.signal.aborted) setView(result);
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Không tải được báo cáo.",
          );
      });
    const changed = () => {
      setView(null);
      setError("");
      setVersion((v) => v + 1);
    };
    window.addEventListener("account-session-changed", changed);
    return () => {
      abort.abort();
      window.removeEventListener("account-session-changed", changed);
    };
  }, [showtimeId, page, version]);
  function refresh() {
    setView(null);
    setError("");
    setVersion((v) => v + 1);
  }
  return (
    <PublicLayout signedIn>
      <main className="operations-page mx-auto max-w-6xl space-y-5 px-4 py-8">
        <Link href="/scanner/snapshot" className="underline">
          Chọn suất khác
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Xung đột giữa các cửa</h1>
          <Button variant="outline" onClick={refresh}>
            Làm mới báo cáo
          </Button>
        </div>
        <p>
          Lượt ngoại tuyến có giờ thiết bị sớm hơn được tính là lần vào. Hai
          thiết bị hoàn toàn mất mạng có thể cùng cho vào trước khi đồng bộ.
        </p>
        <p className="text-sm text-muted-foreground">
          Độ lệch ước tính là giờ máy chủ nhận trừ giờ thiết bị gửi, có gồm độ
          trễ mạng. Hai thời điểm quét dưới đây giữ nguyên giờ thiết bị.
        </p>
        {error ? (
          <section role="alert" className="operations-panel">
            <p>{error}</p>
            <Button onClick={refresh}>Thử lại</Button>
          </section>
        ) : !view ? (
          <p role="status">Đang tải báo cáo…</p>
        ) : (
          <>
            <p role="status">
              {view.pagination.total} lượt xung đột · Trang{" "}
              {view.pagination.page}
            </p>
            {!view.conflicts.length ? (
              <p className="operations-panel">Chưa có xung đột ở trang này.</p>
            ) : (
              <>
                <div className="operations-panel hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vé</TableHead>
                        <TableHead>Lượt được tính</TableHead>
                        <TableHead>Lượt xung đột</TableHead>
                        <TableHead>Truy vết</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {view.conflicts.map((row) => (
                        <TableRow key={row.scanId} data-testid="conflict-row">
                          <TableCell className="max-w-52 break-all">
                            {row.ticketCode}
                          </TableCell>
                          <TableCell>
                            {row.winningGate ?? "Chưa lưu cửa"}
                            <br />
                            {when(row.winningTime)}
                            <br />
                            Lệch: {offset(row.winningClockOffsetMs)}
                          </TableCell>
                          <TableCell>
                            {row.gateName ?? "Chưa lưu cửa"}
                            <br />
                            {when(row.scannedAt)}
                            <br />
                            Lệch: {offset(row.clockOffsetMs)}
                          </TableCell>
                          <TableCell className="max-w-48 break-all">
                            Thiết bị: {row.deviceId}
                            <br />
                            Máy chủ nhận: {when(row.receivedAt)}
                            <br />
                            Lượt: {row.scanId}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-4 md:hidden">
                  {view.conflicts.map((row) => (
                    <article
                      key={row.scanId}
                      className="operations-panel space-y-3 break-words"
                      data-testid="conflict-card"
                    >
                      <h2 className="font-semibold break-all">
                        Vé {row.ticketCode}
                      </h2>
                      <p>
                        <strong>
                          Lượt được tính: {row.winningGate ?? "Chưa lưu cửa"}
                        </strong>
                        <br />
                        {when(row.winningTime)}
                        <br />
                        Lệch: {offset(row.winningClockOffsetMs)}
                      </p>
                      <p>
                        <strong>
                          Xung đột: {row.gateName ?? "Chưa lưu cửa"}
                        </strong>
                        <br />
                        {when(row.scannedAt)}
                        <br />
                        Lệch: {offset(row.clockOffsetMs)}
                      </p>
                      <p className="text-sm break-all">
                        Thiết bị {row.deviceId}
                        <br />
                        Máy chủ nhận: {when(row.receivedAt)}
                        <br />
                        Lượt {row.scanId}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            )}
            <nav
              aria-label="Phân trang xung đột"
              className="flex items-center justify-between gap-3"
            >
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => {
                  setView(null);
                  setPage((p) => p - 1);
                }}
              >
                Trang trước
              </Button>
              <Button
                variant="outline"
                disabled={!view.pagination.hasNext}
                onClick={() => {
                  setView(null);
                  setPage((p) => p + 1);
                }}
              >
                Trang sau
              </Button>
            </nav>
          </>
        )}
      </main>
    </PublicLayout>
  );
}
