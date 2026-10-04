"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceHeader } from "@/components/workspace-header";
import { loadCurrentUser, readApiError } from "@/lib/api";

type EventDetails = {
  id: string;
  name: string;
  description: string;
  location: string;
  status: string;
  showtimes: { id: string; startTime: string }[];
};

const empty = { name: "", description: "", location: "" };

export function EventEditor({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(empty);
  const [details, setDetails] = useState<EventDetails | null>(null);
  const [startTime, setStartTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingShowtime, setSavingShowtime] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const submitting = useRef(false);
  const showtimeSubmitting = useRef(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const user = await loadCurrentUser();
        if (!mounted) return;
        if (!user) { router.replace("/login"); return; }
        if (!user.roles.includes("ORGANIZER")) { setForbidden(true); return; }
        if (!eventId) return;
        const response = await fetch(`/api/events/${eventId}/manage`, { cache: "no-store" });
        if (response.status === 403) { setForbidden(true); return; }
        if (!response.ok) throw new Error();
        const result = await response.json() as EventDetails;
        if (!mounted) return;
        setDetails(result);
        setDraft({ name: result.name, description: result.description, location: result.location });
      } catch {
        if (mounted) setError("Không tải được sự kiện. Hãy tải lại trang.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [eventId, router]);

  function update(field: keyof typeof empty, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const errors: Record<string, string> = {};
    for (const field of ["name", "description", "location"] as const) {
      if (!draft[field].trim()) errors[field] = "Trường này không được để trống.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    submitting.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(eventId ? `/api/events/${eventId}` : "/api/events", {
        method: eventId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (response.status === 403) { setForbidden(true); return; }
      if (!response.ok) {
        const detail = await readApiError(response);
        setFieldErrors(detail.errors ?? {});
        setError(detail.message ?? "Không lưu được sự kiện. Thử lại.");
        return;
      }
      const result = await response.json() as EventDetails;
      if (!eventId) router.replace(`/events/${result.id}`);
      else { setDetails((current) => current ? { ...current, ...result } : result); setMessage("Đã lưu thay đổi."); }
    } catch {
      setError("Không thể kết nối. Nội dung đã nhập vẫn được giữ; hãy thử lại.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  async function addShowtime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId || showtimeSubmitting.current) return;
    if (!startTime || new Date(startTime) <= new Date()) {
      setFieldErrors((current) => ({ ...current, startTime: "Chọn thời gian trong tương lai." }));
      return;
    }
    showtimeSubmitting.current = true;
    setSavingShowtime(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/showtimes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: new Date(startTime).toISOString() }),
      });
      if (response.status === 403) { setForbidden(true); return; }
      if (!response.ok) {
        const detail = await readApiError(response);
        setFieldErrors(detail.errors ?? {});
        setError(detail.message ?? "Không lưu được suất diễn.");
        return;
      }
      const result = await response.json() as { id: string; startTime: string; warning: string | null };
      setDetails((current) => current ? { ...current, showtimes: [...current.showtimes, result].sort((a, b) => a.startTime.localeCompare(b.startTime)) } : current);
      setStartTime("");
      setMessage(result.warning ?? "Đã thêm suất diễn.");
    } catch {
      setError("Không thể kết nối. Hãy thử lại.");
    } finally {
      showtimeSubmitting.current = false;
      setSavingShowtime(false);
    }
  }

  return (
    <>
      <WorkspaceHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <Link href="/events" className="text-sm font-medium text-primary underline-offset-4 hover:underline">← Sự kiện</Link>
        <h1 className="mt-5 text-2xl font-semibold">{eventId ? "Quản lý sự kiện" : "Tạo sự kiện"}</h1>
        {loading && <p role="status" className="mt-8 text-sm text-muted-foreground">Đang tải sự kiện…</p>}
        {forbidden && <div className="mt-8 border-t border-border pt-6"><h2 className="font-semibold">Không có quyền xem sự kiện này</h2><p className="mt-2 text-sm text-muted-foreground">Bạn chỉ có thể quản lý sự kiện của mình.</p></div>}
        {error && <p role="alert" className="mt-6 border-l-2 border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="mt-6 border-l-2 border-green-700 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}
        {!loading && !forbidden && <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
          <section aria-labelledby="event-details-title">
            <div className="border-b border-border pb-4"><h2 id="event-details-title" className="text-lg font-semibold">Thông tin sự kiện</h2>{details && <p className="mt-1 text-sm text-muted-foreground">Trạng thái: {details.status === "DRAFT" ? "Nháp" : details.status}</p>}</div>
            <form className="mt-6 space-y-5" onSubmit={save} noValidate>
              <div className="space-y-2"><Label htmlFor="event-name">Tên sự kiện</Label><Input id="event-name" maxLength={120} value={draft.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "event-name-error" : undefined} disabled={saving} className="h-10" />{fieldErrors.name && <p id="event-name-error" className="text-sm text-destructive">{fieldErrors.name}</p>}</div>
              <div className="space-y-2"><Label htmlFor="event-description">Mô tả</Label><Textarea id="event-description" maxLength={2000} rows={5} value={draft.description} onChange={(event) => update("description", event.target.value)} aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? "event-description-error" : undefined} disabled={saving} />{fieldErrors.description && <p id="event-description-error" className="text-sm text-destructive">{fieldErrors.description}</p>}</div>
              <div className="space-y-2"><Label htmlFor="event-location">Địa điểm</Label><Input id="event-location" maxLength={200} value={draft.location} onChange={(event) => update("location", event.target.value)} aria-invalid={Boolean(fieldErrors.location)} aria-describedby={fieldErrors.location ? "event-location-error" : undefined} disabled={saving} className="h-10" />{fieldErrors.location && <p id="event-location-error" className="text-sm text-destructive">{fieldErrors.location}</p>}</div>
              <Button type="submit" disabled={saving} className="h-11">{saving ? "Đang lưu…" : eventId ? "Lưu thay đổi" : "Tạo sự kiện"}</Button>
            </form>
          </section>
          {eventId && details && <section aria-labelledby="showtimes-title"><div className="border-b border-border pb-4"><h2 id="showtimes-title" className="text-lg font-semibold">Suất diễn</h2><p className="mt-1 text-sm text-muted-foreground">Thêm thời gian bắt đầu cho sự kiện này.</p></div><form onSubmit={addShowtime} className="mt-6 space-y-3" noValidate><Label htmlFor="showtime-start">Thời gian bắt đầu</Label><Input id="showtime-start" type="datetime-local" value={startTime} onChange={(event) => { setStartTime(event.target.value); setFieldErrors((current) => ({ ...current, startTime: "" })); }} aria-invalid={Boolean(fieldErrors.startTime)} aria-describedby={fieldErrors.startTime ? "showtime-error" : undefined} disabled={savingShowtime} className="h-10" />{fieldErrors.startTime && <p id="showtime-error" className="text-sm text-destructive">{fieldErrors.startTime}</p>}<Button type="submit" disabled={savingShowtime} variant="outline" className="h-11">{savingShowtime ? "Đang thêm…" : "Thêm suất diễn"}</Button></form>{details.showtimes.length === 0 ? <p className="mt-8 border-t border-border pt-5 text-sm text-muted-foreground">Chưa có suất diễn.</p> : <ul className="mt-8 border-t border-border">{details.showtimes.map((showtime) => <li key={showtime.id} className="border-b border-border py-4 text-sm"><time dateTime={showtime.startTime}>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(showtime.startTime))}</time></li>)}</ul>}</section>}
        </div>}
      </main>
    </>
  );
}
