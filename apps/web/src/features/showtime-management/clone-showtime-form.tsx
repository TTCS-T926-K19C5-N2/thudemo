"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, object } from "@/lib/api/client";

function decodeClone(value: unknown) {
  const data = object(value);
  if (
    typeof data.id !== "string" ||
    typeof data.startTime !== "string" ||
    Number.isNaN(Date.parse(data.startTime)) ||
    data.status !== "DRAFT" ||
    typeof data.isDemo !== "boolean" ||
    !Number.isInteger(data.seatCount) ||
    !Number.isInteger(data.categoryCount)
  )
    throw new Error("Phản hồi nhân bản suất không hợp lệ.");
  return { id: data.id };
}

export function CloneShowtimeForm({ id }: { id: string }) {
  const router = useRouter();
  const [startTime, setStartTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const parsed = new Date(startTime);
    if (!startTime || Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      setError("Chọn ngày và giờ trong tương lai.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await api(`/showtimes/${id}/clone`, decodeClone, {
        method: "POST",
        body: { startTime: parsed.toISOString() },
      });
      router.push(`/showtimes/${created.id}/manage`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không nhân bản được suất diễn.",
      );
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Nhân bản suất diễn</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tạo suất nháp với sơ đồ ghế và bảng giá hiện tại. Ghế được tạo mới, chưa
        có đơn hàng hay lượt giữ.
      </p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium" htmlFor="clone-start-time">
            Ngày giờ suất mới
          </label>
          <Input
            id="clone-start-time"
            type="datetime-local"
            value={startTime}
            onChange={(event) => setStartTime(event.currentTarget.value)}
            required
            aria-describedby={error ? "clone-showtime-error" : undefined}
          />
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Đang tạo…" : "Tạo suất nháp"}
        </Button>
      </form>
      {error && (
        <Alert className="mt-3" variant="destructive">
          <AlertDescription id="clone-showtime-error">{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
