"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin, RotateCw } from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrganizerLayout } from "@/components/layout/product-layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { loadCurrentUser } from "@/lib/api";

type EventRow = {
  id: string;
  name: string;
  location: string;
  status: string;
  updatedAt: string;
  showtimes: { id: string; startTime?: string }[];
};

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(async () => {
    try {
      setError("");
      const user = await loadCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      } else if (!user.roles.includes("ORGANIZER")) {
        setForbidden(true);
        return;
      }

      const response = await fetch("/api/events/mine", { cache: "no-store" });
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) throw new Error();
      const data = (await response.json()) as EventRow[];
      setEvents(data);
    } catch {
      setError("Không tải được sự kiện. Hãy thử lại.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const filteredEvents = events.filter((event) => {
    const matchesQuery =
      event.name
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")) ||
      event.location
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi"));
    const matchesStatus =
      statusFilter === "ALL" ? true : event.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const totalShowtimes = events.reduce(
    (acc, ev) => acc + (ev.showtimes?.length || 0),
    0,
  );
  const totalDrafts = events.filter((ev) => ev.status === "DRAFT").length;
  const totalPublished = events.filter(
    (ev) => ev.status === "PUBLISHED",
  ).length;

  return (
    <OrganizerLayout title="Quản lý sự kiện" mode="events">
      <div className="operations-page">
        <div className="page-heading">
          <div>
            <h1>Sự kiện & suất diễn</h1>
            <p>Quản lý thông tin sự kiện và các suất diễn của bạn.</p>
          </div>
          {!forbidden && (
            <div className="operations-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  void reload();
                }}
                disabled={loading}
              >
                <RotateCw />
                Làm mới
              </Button>
              <Button asChild>
                <Link href="/events/new">Tạo sự kiện mới</Link>
              </Button>
            </div>
          )}
        </div>
        {forbidden ? (
          <section className="operations-panel" role="alert">
            <h2>Bạn không có quyền quản lý sự kiện</h2>
            <p>Chức năng này dành cho ban tổ chức.</p>
            <Button variant="outline" asChild>
              <Link href="/account">Về tài khoản</Link>
            </Button>
          </section>
        ) : (
          <>
            <dl className="operations-metrics">
              <div>
                <dt>Sự kiện</dt>
                <dd>{events.length}</dd>
              </div>
              <div>
                <dt>Suất diễn</dt>
                <dd>{totalShowtimes}</dd>
              </div>
              <div>
                <dt>Bản nháp</dt>
                <dd>{totalDrafts}</dd>
              </div>
              <div>
                <dt>Đã công bố</dt>
                <dd>{totalPublished}</dd>
              </div>
            </dl>
            <div className="operations-filters">
              <div>
                <label htmlFor="event-search">Tìm sự kiện</label>
                <Input
                  id="event-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tên sự kiện hoặc địa điểm"
                />
              </div>
              <div>
                <label htmlFor="event-status">Trạng thái</label>
                <select
                  id="event-status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả</option>
                  <option value="DRAFT">Bản nháp</option>
                  <option value="PUBLISHED">Đã công bố</option>
                </select>
              </div>
              <div
                className="operations-actions"
                role="group"
                aria-label="Cách hiển thị"
              >
                <Button
                  variant="outline"
                  aria-pressed={viewMode === "table"}
                  onClick={() => setViewMode("table")}
                >
                  Bảng
                </Button>
                <Button
                  variant="outline"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                >
                  Lưới
                </Button>
              </div>
            </div>
            {loading && (
              <div role="status" aria-label="Đang tải sự kiện">
                <Skeleton className="h-48 w-full" />
              </div>
            )}
            {error && (
              <section className="operations-panel" role="alert">
                <p>{error}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setLoading(true);
                    void reload();
                  }}
                >
                  Thử lại
                </Button>
              </section>
            )}
            {!loading && !error && filteredEvents.length === 0 && (
              <section className="operations-panel operations-empty">
                <h2>
                  {events.length ? "Không tìm thấy sự kiện" : "Chưa có sự kiện"}
                </h2>
                <p>
                  {events.length
                    ? "Thử tên hoặc trạng thái khác."
                    : "Tạo sự kiện đầu tiên để bắt đầu."}
                </p>
                {events.length ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("ALL");
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/events/new">Tạo sự kiện mới</Link>
                  </Button>
                )}
              </section>
            )}
            {!loading &&
              !error &&
              filteredEvents.length > 0 &&
              (viewMode === "table" ? (
                <div className="operations-panel operations-table-wrap">
                  <table className="operations-table">
                    <caption className="sr-only">
                      Danh sách sự kiện của bạn
                    </caption>
                    <thead>
                      <tr>
                        <th>Sự kiện</th>
                        <th>Trạng thái</th>
                        <th>Suất diễn</th>
                        <th>Cập nhật</th>
                        <th>
                          <span className="sr-only">Thao tác</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((event) => (
                        <tr key={event.id}>
                          <td>
                            <strong>{event.name}</strong>
                            <p>{event.location}</p>
                          </td>
                          <td>
                            <Badge variant="outline">
                              {event.status === "DRAFT" ? "Nháp" : "Đã công bố"}
                            </Badge>
                          </td>
                          <td>{event.showtimes.length}</td>
                          <td>
                            <time dateTime={event.updatedAt}>
                              {new Intl.DateTimeFormat("vi-VN", {
                                dateStyle: "short",
                              }).format(new Date(event.updatedAt))}
                            </time>
                          </td>
                          <td>
                            <Link
                              href={`/events/${event.id}`}
                              aria-label={`Quản lý ${event.name}`}
                            >
                              Quản lý →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="operations-event-grid">
                  {filteredEvents.map((event) => (
                    <article className="operations-panel" key={event.id}>
                      <Badge variant="outline">
                        {event.status === "DRAFT" ? "Nháp" : "Đã công bố"}
                      </Badge>
                      <h2>{event.name}</h2>
                      <p>
                        <MapPin />
                        {event.location}
                      </p>
                      <p>
                        {event.showtimes.length} suất diễn · Cập nhật{" "}
                        {new Intl.DateTimeFormat("vi-VN", {
                          dateStyle: "short",
                        }).format(new Date(event.updatedAt))}
                      </p>
                      <Button variant="outline" asChild>
                        <Link
                          href={`/events/${event.id}`}
                          aria-label={`Quản lý ${event.name}`}
                        >
                          Quản lý sự kiện
                          <ArrowRight />
                        </Link>
                      </Button>
                    </article>
                  ))}
                </div>
              ))}
          </>
        )}
      </div>
    </OrganizerLayout>
  );
}
