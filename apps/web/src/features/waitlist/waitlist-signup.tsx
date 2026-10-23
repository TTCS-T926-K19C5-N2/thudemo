"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type WaitlistEntry = {
  status: "ACTIVE" | "NOTICE_QUEUED" | "NOTIFIED" | "CANCELLED";
  position: number | null;
};

export function WaitlistSignup({ showtimeId }: { showtimeId: string }) {
  const [entry, setEntry] = useState<WaitlistEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/showtimes/${showtimeId}/waitlist`, {
          cache: "no-store",
        });
        const body = (await response.json()) as { entry?: WaitlistEntry | null; message?: string };
        if (!response.ok) throw new Error(body.message || "Chưa thể tải trạng thái đăng ký chờ.");
        if (active) {
          setEntry(body.entry ?? null);
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Chưa thể tải trạng thái đăng ký chờ.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [showtimeId]);

  async function change(method: "POST" | "DELETE") {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/showtimes/${showtimeId}/waitlist`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
      });
      const body = (await response.json()) as { entry?: WaitlistEntry; message?: string; position?: number };
      if (!response.ok) throw new Error(body.message || "Chưa thể cập nhật đăng ký chờ.");
      if (method === "POST") {
        const next = body.entry ?? (body as unknown as { entry: WaitlistEntry }).entry;
        setEntry(next ? { ...next, position: next.position ?? body.position ?? null } : null);
        setMessage("Đã đăng ký. Bạn sẽ nhận thông báo khi ghế được trả lại bán chung; đăng ký không giữ ghế.");
      } else {
        setEntry(null);
        setMessage("Đã huỷ đăng ký chờ.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chưa thể cập nhật đăng ký chờ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-5 rounded-lg border p-4" aria-labelledby="waitlist-heading">
      <h3 id="waitlist-heading" className="font-semibold">Thông báo khi có ghế</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Thông báo được gửi theo thứ tự đăng ký. Ghế vẫn mở bán chung, không được giữ riêng; người mua trước có thể lấy ghế.
      </p>
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertTitle>Chưa thể cập nhật</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      {loading ? (
        <p role="status" className="mt-3 text-sm">Đang tải trạng thái đăng ký…</p>
      ) : entry ? (
        <div className="mt-3 space-y-2">
          <p role="status" className="text-sm">
            {entry.status === "NOTIFIED" ? "Đã gửi thông báo" : entry.status === "NOTICE_QUEUED" ? "Đang chuẩn bị thông báo" : `Đang chờ${entry.position ? ` · vị trí ${entry.position}` : ""}`}
          </p>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void change("DELETE")}>
            {saving ? "Đang cập nhật…" : "Huỷ đăng ký chờ"}
          </Button>
        </div>
      ) : (
        <Button type="button" className="mt-3" disabled={saving} onClick={() => void change("POST")}>
          {saving ? "Đang đăng ký…" : "Đăng ký nhận thông báo"}
        </Button>
      )}
    </section>
  );
}
