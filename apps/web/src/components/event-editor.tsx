"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrganizerLayout } from "@/components/layout/product-layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { loadCurrentUser, readApiError } from "@/lib/api";
import { PublicationControl } from "@/features/core/publication-control";
import { EventCouponsManager } from "@/features/coupons/event-coupons-manager";
import {
  vietnamInputToUtc,
  vietnamInputFromUtc,
} from "@/lib/formatting/vietnam-input";

type EventDetails = {
  id: string;
  name: string;
  description: string;
  location: string;
  status: string;
  showtimes: { id: string; startTime: string; status?: string }[];
};

const empty = { name: "", description: "", location: "" };

const VENUE_PRESETS = [
  "Nhà hát Hoà Bình (TP.HCM)",
  "Sân vận động Quốc gia Mỹ Đình (Hà Nội)",
  "Trung tâm Hội nghị Quốc gia (NCC)",
  "Nhà thi đấu Phú Thọ (TP.HCM)",
];

interface EventEditorProps {
  readonly eventId?: string;
}

export function EventEditor({ eventId }: EventEditorProps) {
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
  const ownerId = useRef("");
  const draftKey = `event-draft:${eventId ?? "new"}`;
  const descriptionLimit = Math.max(2000, details?.description.length ?? 0);

  function recoverSession() {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ ownerId: ownerId.current, draft, startTime }),
      );
    } catch {
      /* Storage may be unavailable. */
    }
    router.replace(
      `/login?returnTo=${encodeURIComponent(eventId ? `/events/${eventId}` : "/events/new")}`,
    );
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const user = await loadCurrentUser();
        if (!mounted) return;
        if (!user) {
          router.replace("/login");
          return;
        } else if (!user.roles.includes("ORGANIZER")) {
          setForbidden(true);
          return;
        }
        ownerId.current = user.id;

        if (!eventId) {
          restoreDraft(user.id);
          if (mounted) setLoading(false);
          return;
        }

        const response = await fetch(`/api/events/${eventId}/manage`, {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (response.status === 403) {
          setForbidden(true);
          return;
        }
        if (!response.ok) throw new Error();
        const result = (await response.json()) as EventDetails;
        if (!mounted) return;
        setDetails(result);
        setDraft({
          name: result.name,
          description: result.description,
          location: result.location,
        });
        restoreDraft(user.id);
      } catch {
        if (mounted) setError("Không tải được sự kiện. Hãy thử lại.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    function restoreDraft(userId: string) {
      try {
        const saved = sessionStorage.getItem(draftKey);
        sessionStorage.removeItem(draftKey);
        if (!saved) return;
        const value = JSON.parse(saved) as {
          ownerId?: string;
          draft?: typeof empty;
          startTime?: string;
        };
        if (value.ownerId !== userId) return;
        if (
          value.draft &&
          [
            value.draft.name,
            value.draft.description,
            value.draft.location,
          ].every((v) => typeof v === "string")
        )
          setDraft(value.draft);
        if (typeof value.startTime === "string") setStartTime(value.startTime);
      } catch {
        /* Ignore unavailable storage or malformed drafts. */
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [eventId, router, draftKey]);

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
      if (!draft[field].trim())
        errors[field] = "Trường này không được để trống.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    submitting.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        eventId ? `/api/events/${eventId}` : "/api/events",
        {
          method: eventId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (response.status === 401) {
        recoverSession();
        return;
      }
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const detail = await readApiError(response);
        setFieldErrors(detail.errors ?? {});
        setError(
          detail.message ??
            "Không lưu được thông tin sự kiện. Vui lòng thử lại.",
        );
        return;
      }
      const result = (await response.json()) as EventDetails;
      if (!eventId) {
        router.replace(`/events/${result.id}`);
      } else {
        setDetails((current) => (current ? { ...current, ...result } : result));
        setMessage("Đã lưu các thay đổi của sự kiện thành công.");
      }
    } catch {
      setError("Không lưu được dữ liệu. Kiểm tra kết nối rồi thử lại.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  async function addShowtime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (showtimeSubmitting.current) return;
    const startTimeUtc = vietnamInputToUtc(startTime);
    if (!startTimeUtc || new Date(startTimeUtc) <= new Date()) {
      setFieldErrors((current) => ({
        ...current,
        startTime: "Vui lòng chọn thời gian bắt đầu trong tương lai.",
      }));
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
        body: JSON.stringify({ startTime: startTimeUtc }),
      });
      if (response.status === 401) {
        recoverSession();
        return;
      }
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const detail = await readApiError(response);
        setFieldErrors(detail.errors ?? {});
        setError(detail.message ?? "Không lưu được suất diễn.");
        return;
      }
      const result = (await response.json()) as {
        id: string;
        startTime: string;
        warning: string | null;
      };
      setDetails((current) =>
        current
          ? {
              ...current,
              showtimes: [...current.showtimes, result].sort((a, b) =>
                a.startTime.localeCompare(b.startTime),
              ),
            }
          : current,
      );
      setStartTime("");
      setMessage(result.warning ?? "Đã thêm suất diễn mới thành công.");
    } catch {
      setError("Không lưu được dữ liệu. Kiểm tra kết nối rồi thử lại.");
    } finally {
      showtimeSubmitting.current = false;
      setSavingShowtime(false);
    }
  }

  function setPresetTime(hoursAhead: number) {
    const d = new Date();
    d.setTime(d.getTime() + hoursAhead * 60 * 60 * 1000);
    d.setUTCMinutes(0, 0, 0);
    setStartTime(vietnamInputFromUtc(d));
    setFieldErrors((current) => ({ ...current, startTime: "" }));
  }

  return (
    <OrganizerLayout
      title={eventId ? "Chi tiết sự kiện" : "Tạo sự kiện"}
      mode="events"
    >
      <div className="operations-page">
        <Link className="operations-back" href="/events">
          <ArrowLeft />
          Về danh sách sự kiện
        </Link>
        <div className="page-heading">
          <div>
            <h1>{eventId ? "Chi tiết sự kiện" : "Tạo sự kiện mới"}</h1>
            <p>Thông tin sự kiện và lịch biểu diễn.</p>
          </div>
          {details && (
            <Badge variant="outline">
              {details.status === "DRAFT" ? "Nháp" : "Đã công bố"}
            </Badge>
          )}
        </div>
        {details && (
          <PublicationControl
            id={details.id}
            initialStatus={details.status}
            onStatusChanged={(status) =>
              setDetails((current) => (current ? { ...current, status } : current))
            }
          />
        )}
        {loading && (
          <div role="status" aria-label="Đang tải sự kiện">
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {error && (
          <p className="operations-notice operations-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="operations-notice" role="status">
            {message}
          </p>
        )}
        {forbidden && (
          <section className="operations-panel" role="alert">
            <h2>Bạn không có quyền sửa sự kiện này</h2>
            <p>Quay về danh sách sự kiện thuộc quyền quản lý của bạn.</p>
            <Button variant="outline" asChild>
              <Link href="/events">Về danh sách sự kiện</Link>
            </Button>
          </section>
        )}
        {!loading && !forbidden && (!eventId || details) && (
          <div className="operations-editor">
            <form
              onSubmit={save}
              className="operations-panel operations-form"
              aria-labelledby="event-form-title"
              noValidate
            >
              <div>
                <h2 id="event-form-title">Thông tin sự kiện</h2>
                <p>Các trường có dấu * là bắt buộc.</p>
              </div>
              <div>
                <Label htmlFor="event-name">Tên sự kiện *</Label>
                <Input
                  id="event-name"
                  maxLength={120}
                  value={draft.name}
                  onChange={(e) => update("name", e.target.value)}
                  disabled={saving}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? "name-error" : undefined}
                />
                {fieldErrors.name && (
                  <p id="name-error" className="operations-field-error">
                    {fieldErrors.name}
                  </p>
                )}
                <small>{draft.name.length}/120</small>
              </div>
              <div>
                <Label htmlFor="event-location">Địa điểm *</Label>
                <Input
                  id="event-location"
                  maxLength={200}
                  value={draft.location}
                  onChange={(e) => update("location", e.target.value)}
                  disabled={saving}
                  aria-invalid={!!fieldErrors.location}
                  aria-describedby={
                    fieldErrors.location ? "location-error" : undefined
                  }
                />
                {fieldErrors.location && (
                  <p id="location-error" className="operations-field-error">
                    {fieldErrors.location}
                  </p>
                )}
                <details className="operations-presets">
                  <summary>Địa điểm gợi ý</summary>
                  {VENUE_PRESETS.map((venue) => (
                    <Button
                      key={venue}
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => update("location", venue)}
                    >
                      {venue}
                    </Button>
                  ))}
                </details>
              </div>
              <div>
                <Label htmlFor="event-description">Mô tả chi tiết *</Label>
                <Textarea
                  id="event-description"
                  rows={6}
                  maxLength={descriptionLimit}
                  value={draft.description}
                  onChange={(e) => update("description", e.target.value)}
                  disabled={saving}
                  aria-invalid={!!fieldErrors.description}
                  aria-describedby={
                    fieldErrors.description ? "description-error" : undefined
                  }
                />
                {fieldErrors.description && (
                  <p id="description-error" className="operations-field-error">
                    {fieldErrors.description}
                  </p>
                )}
                <small>{draft.description.length}/{descriptionLimit}</small>
              </div>
              <div className="operations-actions">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Đang lưu…"
                    : eventId
                      ? "Lưu thay đổi"
                      : "Tạo sự kiện"}
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/events">Hủy</Link>
                </Button>
              </div>
            </form>
            {eventId && details && (
              <section
                className="operations-panel operations-form"
                aria-labelledby="showtimes-title"
              >
                <div>
                  <h2 id="showtimes-title">Suất diễn</h2>
                  <p>Thêm suất diễn, sau đó cấu hình sơ đồ ghế và giá vé.</p>
                </div>
                <form
                  onSubmit={addShowtime}
                  className="operations-form"
                  noValidate
                >
                  <div>
                    <Label htmlFor="showtime-start">
                      Thời gian bắt đầu (giờ Việt Nam) *
                    </Label>
                    <Input
                      id="showtime-start"
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        setFieldErrors((current) => ({
                          ...current,
                          startTime: "",
                        }));
                      }}
                      disabled={savingShowtime}
                      aria-invalid={!!fieldErrors.startTime}
                      aria-describedby={
                        fieldErrors.startTime ? "start-error" : undefined
                      }
                    />
                    {fieldErrors.startTime && (
                      <p id="start-error" className="operations-field-error">
                        {fieldErrors.startTime}
                      </p>
                    )}
                  </div>
                  <div
                    className="operations-actions"
                    role="group"
                    aria-label="Thời gian gợi ý"
                  >
                    {[24, 48, 72].map((hours) => (
                      <Button
                        key={hours}
                        variant="outline"
                        type="button"
                        disabled={savingShowtime}
                        onClick={() => setPresetTime(hours)}
                      >
                        +{hours} giờ
                      </Button>
                    ))}
                  </div>
                  <Button type="submit" disabled={savingShowtime}>
                    {savingShowtime ? "Đang thêm…" : "Thêm suất diễn"}
                  </Button>
                </form>
                {details.showtimes.length === 0 ? (
                  <p>Chưa có suất diễn. Thêm suất đầu tiên ở trên.</p>
                ) : (
                  <ul className="operations-showtimes">
                    {details.showtimes.map((st) => (
                      <li key={st.id}>
                        <div>
                          <time dateTime={st.startTime}>
                            {new Intl.DateTimeFormat("vi-VN", {
                              timeZone: "Asia/Ho_Chi_Minh",
                              dateStyle: "full",
                              timeStyle: "short",
                            }).format(new Date(st.startTime))}
                          </time>
                          <p>
                            {st.status === "ON_SALE"
                              ? "Đang bán"
                              : st.status === "CLOSED"
                                ? "Đã đóng"
                                : "Nháp"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Link href={`/showtimes/${st.id}/manage`}>
                            Quản lý suất →
                          </Link>
                          <a
                            href={`/api/showtimes/${st.id}/attendance-conflicts.csv`}
                            download={`attendance-${st.id}.csv`}
                            className="text-sm text-primary underline hover:text-primary/80 font-medium"
                          >
                            Xuất CSV điểm danh
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {eventId && details && <EventCouponsManager eventId={details.id} />}
          </div>
        )}
      </div>
    </OrganizerLayout>
  );
}
