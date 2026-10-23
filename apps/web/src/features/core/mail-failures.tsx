"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, object } from "@/lib/api/client";
type Row = {
  id: string;
  kind: string;
  orderId: string;
  showtimeId: string;
  status: string;
  attempts: number;
  failureCode: string | null;
  updatedAt: string;
};
export function MailFailures() {
  const [data, setData] = useState<{
      items: Row[];
      total: number;
      notificationWorkerEnabled: boolean;
      passwordResetWorkerEnabled: boolean;
    } | null>(null),
    [page, setPage] = useState(1),
    [kind, setKind] = useState("ALL"),
    [status, setStatus] = useState("FAILED"),
    [selected, setSelected] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const retry = useRef<{ source: string; id: string } | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      await Promise.resolve();
      if (signal?.aborted) return;
      setLoading(true);
      try {
        const r = await api(
          `/operations/mail?page=${page}&kind=${kind}&status=${status}`,
          object,
          { signal },
        );
        if (!signal?.aborted) {
          setData(r as unknown as NonNullable<typeof data>);
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "Không tải được email.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, kind, status],
  );
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => load(c.signal));
    return () => c.abort();
  }, [load]);
  async function resend(row: Row) {
    if (!confirmed || busy) return;
    const source = `${row.kind}:${row.id}`;
    if (retry.current?.source !== source)
      retry.current = { source, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const r = await api("/operations/mail/retry", object, {
        method: "POST",
        body: { kind: row.kind, id: row.id, requestId: retry.current.id },
      });
      setMessage(
        `Công việc ${r.deliveryId}: ${r.status}. Xếp hàng chưa có nghĩa đã gửi.`,
      );
      setConfirmed(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa gửi lại được.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operations-panel space-y-4">
      <h2>Email gửi lỗi</h2>
      <p>
        Worker nhắc/đổi giờ:{" "}
        {data
          ? data.notificationWorkerEnabled
            ? "Đang bật"
            : "Đang tắt"
          : "Đang tải…"}{" "}
        · Worker đặt lại mật khẩu:{" "}
        {data
          ? data.passwordResetWorkerEnabled
            ? "Đang bật"
            : "Đang tắt"
          : "Đang tải…"}
      </p>
      <div className="flex flex-wrap gap-3">
        <label>
          Loại thư
          <select
            aria-label="Loại email"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
              setSelected("");
              setConfirmed(false);
            }}
          >
            {["ALL", "TICKET", "REMINDER", "RESCHEDULED"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Trạng thái
          <select
            aria-label="Trạng thái email"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
              setSelected("");
              setConfirmed(false);
            }}
          >
            {["FAILED", "QUEUED", "SENDING", "SENT", "CANCELLED", "ALL"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Tải lại email
        </Button>
      </div>
      {loading && <p role="status">Đang tải email…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {data && !data.items.length && !loading && (
        <p>Không có email theo bộ lọc.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Loại",
                "Đơn / suất",
                "Trạng thái",
                "Số lần",
                "Mã lỗi",
                "Cập nhật",
                "Thao tác",
              ].map((x) => (
                <th className="p-2" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={`${r.kind}:${r.id}`}>
                <td className="p-2">{r.kind}</td>
                <td className="p-2 break-all">
                  {r.orderId}
                  <br />
                  {r.showtimeId}
                </td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{r.attempts}</td>
                <td className="p-2">{r.failureCode ?? "—"}</td>
                <td className="p-2">
                  {new Date(r.updatedAt).toLocaleString("vi-VN")}
                </td>
                <td className="p-2">
                  {r.status === "FAILED" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelected(r.id);
                        setConfirmed(false);
                      }}
                      disabled={busy}
                    >
                      Chọn gửi lại
                    </Button>
                  )}
                  {selected === r.id && r.status === "FAILED" && (
                    <div className="space-y-2">
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                          disabled={busy}
                        />
                        Tôi xác nhận tạo lượt gửi mới tới người nhận hợp lệ hiện
                        tại.
                      </label>
                      <Button
                        onClick={() => void resend(r)}
                        disabled={!confirmed || busy}
                      >
                        {busy ? "Đang xử lý…" : "Thử gửi lại"}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 items-center">
        <Button
          variant="outline"
          disabled={page === 1 || loading || busy}
          onClick={() => {
            setPage((p) => p - 1);
            setSelected("");
            setConfirmed(false);
          }}
        >
          Trang trước
        </Button>
        <span>
          Trang {page} · {data?.total ?? 0} email
        </span>
        <Button
          variant="outline"
          disabled={!data || page * 20 >= data.total || loading || busy}
          onClick={() => {
            setPage((p) => p + 1);
            setSelected("");
            setConfirmed(false);
          }}
        >
          Trang sau
        </Button>
      </div>
    </section>
  );
}
