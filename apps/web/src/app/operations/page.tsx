"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, object } from "@/lib/api/client";
import { loadCurrentUser, type CurrentUser } from "@/lib/api";

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] =>
  Array.isArray(v)
    ? v.filter(
        (r): r is Row => !!r && typeof r === "object" && !Array.isArray(r),
      )
    : [];
const text = (v: unknown) => (v === null || v === undefined ? "—" : String(v));
function DataTable({
  data,
  columns,
}: {
  data: Row[];
  columns: [string, string][];
}) {
  return data.length ? (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key} className="p-2">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={text(r.id ?? r.transactionId ?? i)}>
              {columns.map(([key]) => (
                <td key={key} className="p-2 break-words">
                  {text(r[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p>Chưa có dữ liệu.</p>
  );
}
export default function OperationsPage() {
  const [monitoring, setMonitoring] = useState<Row | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null),
    [shows, setShows] = useState<Row[]>([]),
    [selected, setSelected] = useState(""),
    [finance, setFinance] = useState<Row | null>(null),
    [attendance, setAttendance] = useState<Row | null>(null),
    [job, setJob] = useState<Row | null>(null);
  const [refunds, setRefunds] = useState<Row[]>([]),
    [requests, setRequests] = useState<Row[]>([]),
    [statement, setStatement] = useState("transactionId,amount\n"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [reconciliation, setReconciliation] = useState<Row[]>([]);
  const [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [approved, setApproved] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const organizer = !!user?.roles.some((r) =>
      ["ADMIN", "ORGANIZER"].includes(r),
    ),
    accountant = !!user?.roles.some((r) => ["ADMIN", "ACCOUNTANT"].includes(r)),
    admin = !!user?.roles.includes("ADMIN");
  useEffect(() => {
    if (!admin) return;
    const controller = new AbortController();
    const load = () =>
      void api("/operations/monitoring", object, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) setMonitoring(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error ? e.message : "Không tải được giám sát.",
            );
        });
    load();
    const timer = setInterval(load, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [admin]);
  useEffect(() => {
    let active = true;
    void loadCurrentUser()
      .then(async (u) => {
        if (!active) return;
        setUser(u);
        if (!u) {
          setError("Hãy đăng nhập để tiếp tục.");
          return;
        }
        if (u.roles.some((r) => ["ADMIN", "ORGANIZER"].includes(r))) {
          const list = await api("/scanner/showtimes", rows);
          if (active) {
            setShows(list);
            setSelected(String(list[0]?.id ?? ""));
          }
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Không tải được tài khoản.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function loadLists() {
    if (accountant)
      setRefunds(rows((await api("/operations/refunds", object)).refunds));
    if (admin)
      setRequests(rows((await api("/operations/erasure", object)).requests));
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (accountant) {
          const r = await api("/operations/refunds", object);
          if (active) setRefunds(rows(r.refunds));
        }
        if (admin) {
          const r = await api("/operations/erasure", object);
          if (active) setRequests(rows(r.requests));
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Không tải được danh sách.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accountant, admin]);
  useEffect(() => {
    if (!organizer || !selected) return;
    const controller = new AbortController();
    async function load() {
      try {
        const [f, a, c] = await Promise.all(
          ["financial-report", "attendance-report", "cancellation"].map((s) =>
            api(`/showtimes/${selected}/${s}`, object, {
              signal: controller.signal,
            }),
          ),
        );
        if (!controller.signal.aborted) {
          setFinance(f);
          setAttendance(a);
          setJob(c);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Không tải được báo cáo.");
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [selected, organizer]);
  async function action(work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await loadLists();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác chưa hoàn tất.");
    } finally {
      setBusy(false);
    }
  }
  async function importStatement(dryRun: boolean) {
    const data = await api("/operations/reconciliation", object, {
      method: "POST",
      body: {
        csv: statement,
        periodStart: start,
        periodEnd: end,
        gateway: "mock",
        dryRun,
      },
    });
    setReconciliation(rows(dryRun ? data.rows : object(data.result).rows));
  }
  return (
    <PublicLayout signedIn={!!user}>
      <main className="operations-page space-y-6">
        <h1>Vận hành và báo cáo</h1>
        <Link href="/account">Về tài khoản</Link>
        <p>
          Thanh toán và hoàn tiền ở đây là giả lập cho đồ án local. Báo cáo suất
          tự cập nhật mỗi 15 giây.
        </p>
        {!user && !error && <p role="status">Đang tải tài khoản…</p>}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {admin && monitoring && (
          <section className="operations-panel">
            <h2>Giám sát và cảnh báo</h2>
            {monitoring.enabled !== true ? (
              <p>Giám sát hiện chưa được bật.</p>
            ) : (
              <>
                <p>
                  Cửa sổ quan sát tối đa 5 phút. Cảnh báo local được hiển thị
                  tại đây và ghi nhật ký hệ thống.
                </p>
                <DataTable
                  data={[object(monitoring.stats)]}
                  columns={[
                    ["requests", "Yêu cầu"],
                    ["errorRatePercent", "Lỗi5xx (%)"],
                    ["p95Ms", "p95 (ms)"],
                    ["holdConflicts", "Xung đột giữ ghế"],
                    ["webhookRejected", "Webhook bị từ chối"],
                  ]}
                />
                {Array.isArray(monitoring.alerts) &&
                monitoring.alerts.length > 0 ? (
                  <ul role="alert">
                    {monitoring.alerts.map((code) => (
                      <li key={String(code)}>
                        {(
                          {
                            HIGH_ERROR_RATE: "Tỷ lệ lỗi cao",
                            HIGH_P95_LATENCY: "Thời gian phản hồi p95 cao",
                            HOLD_CONFLICT_BURST: "Nhiều xung đột giữ ghế",
                            REJECTED_WEBHOOK: "Có webhook không hợp lệ",
                          } as Record<string, string>
                        )[String(code)] ?? String(code)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Chưa ghi nhận cảnh báo trong cửa sổ quan sát. Dấu “—” nghĩa
                    là chưa có số đo.
                  </p>
                )}
                <DataTable
                  data={rows(monitoring.history)}
                  columns={[
                    ["at", "Thời điểm"],
                    ["code", "Cảnh báo"],
                    ["state", "Trạng thái"],
                  ]}
                />
              </>
            )}
          </section>
        )}
        {user && !organizer && !accountant && (
          <p>
            Bạn chưa được cấp quyền vận hành.{" "}
            <Link href="/login">Đăng nhập tài khoản được phân quyền</Link>.
          </p>
        )}
        {organizer && (
          <>
            <section className="operations-panel">
              <h2>Báo cáo theo suất diễn</h2>
              <label>
                Suất diễn{" "}
                <select
                  className="w-full border rounded p-2"
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setFinance(null);
                    setAttendance(null);
                    setJob(null);
                    setConfirmed(false);
                  }}
                >
                  {shows.map((s) => (
                    <option key={text(s.id)} value={text(s.id)}>
                      {text(s.name)}
                    </option>
                  ))}
                </select>
              </label>
              {!shows.length && <p>Chưa có suất diễn thuộc quyền quản lý.</p>}
              {finance && (
                <>
                  <h3>Doanh thu và tồn vé · VND</h3>
                  <DataTable
                    data={rows(finance.categories)}
                    columns={[
                      ["category", "Hạng vé"],
                      ["sold", "Đã bán"],
                      ["held", "Đang giữ"],
                      ["available", "Còn trống"],
                      ["gross", "Đã thu"],
                      ["refunded", "Đã hoàn"],
                      ["net", "Còn lại"],
                    ]}
                  />
                  <p>Cập nhật: {text(finance.generatedAt)}</p>
                </>
              )}
              {attendance && (
                <>
                  <h3>Khách vào cửa</h3>
                  <p>
                    Đã vào: {text(attendance.entered)} · Chưa vào:{" "}
                    {text(attendance.notEntered)}
                  </p>
                  <DataTable
                    data={rows(attendance.byMinuteAndGate)}
                    columns={[
                      ["minute", "Phút (UTC)"],
                      ["gateName", "Cửa"],
                      ["entered", "Lượt khách"],
                    ]}
                  />
                  <p>
                    Loại trừ lượt ngoại lệ trùng khách. Lượt offline được cập
                    nhật sau khi đồng bộ.
                  </p>
                </>
              )}
            </section>
            {selected && (
              <section className="operations-panel">
                <h2>Huỷ suất diễn</h2>
                <p>
                  Đóng bán và huỷ vé; hoàn 100% từng đơn qua cổng mock. Các đơn
                  được xử lý theo lô có thể tiếp tục sau gián đoạn.
                </p>
                {job?.job ? (
                  <>
                    <p>Trạng thái: {text(object(job.job).status)}</p>
                    <DataTable
                      data={rows(job.refunds)}
                      columns={[
                        ["status", "Hoàn tiền"],
                        ["_count", "Số đơn"],
                      ]}
                    />
                    {object(job.job).status === "FAILED" && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () =>
                              api(
                                `/showtimes/${selected}/cancellation/retry`,
                                object,
                                { method: "POST", body: {} },
                              ),
                            "Đã xếp lịch lại lô lỗi.",
                          )
                        }
                      >
                        Thử lại lô lỗi
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <label>
                      Lý do huỷ
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        disabled={busy}
                      />
                      Tôi xác nhận huỷ suất đang chọn và toàn bộ vé thuộc suất
                      này.
                    </label>
                    <Button
                      variant="destructive"
                      disabled={busy || !confirmed || reason.trim().length < 5}
                      onClick={() =>
                        void action(async () => {
                          const result = await api(
                            `/showtimes/${selected}/cancel`,
                            object,
                            { method: "POST", body: { reason } },
                          );
                          setJob({ job: result, refunds: [] });
                        }, "Đã đóng bán và xếp lịch huỷ/hoàn tiền.")
                      }
                    >
                      Huỷ suất và hoàn tiền giả lập
                    </Button>
                  </>
                )}
              </section>
            )}
          </>
        )}
        {accountant && (
          <>
            <section className="operations-panel">
              <h2>Lệnh hoàn tiền cần xử lý</h2>
              <DataTable
                data={refunds}
                columns={[
                  ["id", "Mã lệnh"],
                  ["orderId", "Mã đơn"],
                  ["amount", "VND"],
                  ["status", "Trạng thái"],
                  ["failureCode", "Lý do"],
                ]}
              />
              {refunds.map((r) => (
                <p key={text(r.id)}>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        () =>
                          api(
                            `/operations/refunds/${text(r.id)}/resolve-mock`,
                            object,
                            { method: "POST", body: {} },
                          ),
                        "Đã xử lý giả lập lệnh hoàn.",
                      )
                    }
                  >
                    Xác nhận hoàn giả lập · {text(r.orderId)}
                  </Button>
                </p>
              ))}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void action(loadLists, "Đã tải lại danh sách.")}
              >
                Tải lại
              </Button>
            </section>
            <section className="operations-panel">
              <h2>Đối soát giao dịch mock</h2>
              <p>
                CSV: transactionId,amount. Kỳ theo UTC, đầu kỳ bao gồm và cuối
                kỳ không bao gồm. Không nhập sao kê thật vào định dạng mẫu này.
              </p>
              <label>
                Từ ngày
                <Input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Đến ngày (không bao gồm)
                <Input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <label>
                Nội dung CSV
                <Textarea
                  rows={6}
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !start || !end}
                  onClick={() =>
                    void action(
                      () => importStatement(true),
                      "Đã kiểm tra; chưa lưu kết quả đối soát.",
                    )
                  }
                >
                  Kiểm tra trước
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !start || !end}
                  onClick={() =>
                    void action(
                      () => importStatement(false),
                      "Đã lưu kết quả đối soát; giao dịch gốc không thay đổi.",
                    )
                  }
                >
                  Lưu kết quả
                </Button>
              </div>
              <DataTable
                data={reconciliation}
                columns={[
                  ["transactionId", "Giao dịch"],
                  ["systemAmount", "Hệ thống"],
                  ["providerAmount", "Sao kê"],
                  ["classification", "Phân loại"],
                ]}
              />
            </section>
          </>
        )}
        {admin && (
          <section className="operations-panel">
            <h2>Yêu cầu xoá dữ liệu</h2>
            <p>
              Chỉ phê duyệt sau khi đối chiếu đúng người yêu cầu. Đơn và số tiền
              được giữ; tài khoản bị vô hiệu hoá và thông tin cá nhân được ẩn
              danh.
            </p>
            {!requests.length && <p>Chưa có yêu cầu chờ duyệt.</p>}
            {requests.map((r) => (
              <div key={text(r.userId)} className="space-y-2">
                <p>
                  Tài khoản: {text(r.userId)} · Gửi lúc: {text(r.createdAt)}
                </p>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={approved === r.userId}
                    onChange={(e) =>
                      setApproved(e.target.checked ? text(r.userId) : "")
                    }
                  />
                  Tôi đã đối chiếu yêu cầu này.
                </label>
                <Button
                  variant="destructive"
                  disabled={busy || approved !== r.userId}
                  onClick={() =>
                    void action(
                      () =>
                        api(
                          `/privacy/erasure/${text(r.userId)}/approve`,
                          object,
                          { method: "POST", body: {} },
                        ),
                      "Đã ẩn danh tài khoản và thu hồi phiên.",
                    )
                  }
                >
                  Phê duyệt ẩn danh
                </Button>
              </div>
            ))}
          </section>
        )}
      </main>
    </PublicLayout>
  );
}
