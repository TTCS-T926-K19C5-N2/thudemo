"use client";

import { useEffect, useState } from "react";
import { api, object } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Staff = { id: string; email: string; isActive: boolean; roles: string[] };
type Show = { id: string; name: string };
export function StaffAssignment({ users }: { users: Staff[] }) {
  const [shows, setShows] = useState<Show[]>([]);
  const [staff, setStaff] = useState("");
  const [show, setShow] = useState("");
  const [gate, setGate] = useState("");
  const [override, setOverride] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void api(
      "/admin/users/scanner-showtimes",
      (value) => {
        if (!Array.isArray(value)) throw Error("Không đọc được suất diễn.");
        return value.map((raw) => {
          const item = object(raw),
            event = object(item.event);
          return {
            id: String(item.id),
            name: `${event.name} — ${new Date(String(item.startTime)).toLocaleString("vi-VN")}`,
          };
        });
      },
      { signal: abort.signal },
    )
      .then(setShows)
      .catch(() => {
        if (!abort.signal.aborted)
          setError("Không tải được suất diễn để phân công.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, []);
  return (
    <form
      className="operations-panel space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setSuccess("");
        try {
          await api(`/admin/users/${staff}/assignment`, object, {
            method: "POST",
            body: {
              showtimeId: show,
              gateName: gate,
              canOverride: override,
              enabled,
            },
          });
          setSuccess(
            enabled
              ? "Đã phân công suất/cửa. Quyền có hiệu lực ngay."
              : "Đã thu hồi quyền tại cửa.",
          );
        } catch (reason) {
          setError(
            reason instanceof Error ? reason.message : "Không phân công được.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Phân công suất và cửa soát vé</h2>
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
      {loading ? (
        <p role="status">Đang tải suất diễn…</p>
      ) : !shows.length ? (
        <p>Chưa có suất diễn để phân công.</p>
      ) : (
        <>
          <Label htmlFor="assign-staff">
            Nhân viên trong trang tài khoản hiện tại
          </Label>
          <select
            id="assign-staff"
            className="h-11 w-full rounded-md border bg-background px-3"
            value={staff}
            onChange={(e) => setStaff(e.target.value)}
            required
            disabled={busy}
          >
            <option value="">Chọn nhân viên</option>
            {users
              .filter((u) => u.isActive && u.roles.includes("STAFF"))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
          </select>
          <Label htmlFor="assign-show">Suất diễn</Label>
          <select
            id="assign-show"
            className="h-11 w-full rounded-md border bg-background px-3"
            value={show}
            onChange={(e) => setShow(e.target.value)}
            required
            disabled={busy}
          >
            <option value="">Chọn suất diễn</option>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Label htmlFor="assign-gate">Tên cửa</Label>
          <Input
            id="assign-gate"
            value={gate}
            onChange={(e) => setGate(e.target.value)}
            maxLength={80}
            required
            disabled={busy}
          />
          <Label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              disabled={busy}
            />
            Cho phép vào lại có ghi chú tại cửa này
          </Label>
          <Label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={busy}
            />
            Cấp quyền (bỏ chọn để thu hồi)
          </Label>
          <Button disabled={busy || !staff || !show || !gate.trim()}>
            {busy ? "Đang xử lý…" : "Lưu phân công"}
          </Button>
        </>
      )}
    </form>
  );
}
