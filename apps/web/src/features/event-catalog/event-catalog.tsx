"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Schedule,
  MapPin,
  ArrowRight,
  Search,
  Info,
  CloudOff,
  SearchX,
  ImageIcon,
  CircleAlert,
} from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { decodeCatalog, type CatalogPage } from "@/lib/contracts/showtimes";
import {
  formatVnd,
  formatVndCompact,
  formatShowtime,
  shortDate,
} from "@/lib/formatting";
import { EventPoster } from "./event-poster";
function Filters({ mobile = false }: { mobile?: boolean }) {
  return (
    <div
      className={`catalog-filters ${mobile ? "mobile-only" : ""}`}
      aria-label="Loại sự kiện"
    >
      {[
        "Tất cả",
        "Ca nhạc",
        "Kịch & Hài kịch",
        "Workshop nghệ thuật",
        "Cổ điển",
      ].map((name, i) => (
        <button
          key={name}
          type="button"
          className={i === 0 ? "active" : ""}
          disabled
          title={
            i === 0
              ? "Hiển thị tất cả suất đang bán"
              : "Lọc thể loại chưa khả dụng"
          }
        >
          {name}
        </button>
      ))}
    </div>
  );
}
export function EventCatalog() {
  const [data, setData] = useState<CatalogPage | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<(string | null)[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(
      `/showtimes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      decodeCatalog,
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cursor, retry]);
  function next(c: string | null) {
    setLoading(true);
    setError("");
    setCursor(c);
  }
  function reload() {
    setLoading(true);
    setError("");
    setRetry((v) => v + 1);
  }
  return (
    <>
      <section className="catalog-hero">
        <div>
          <span className="season-label">MÙA DIỄN 2026</span>
          <span className="season-subtitle">
            Sân khấu kịch nghệ &amp; Thính phòng âm nhạc
          </span>
          <h1>Chương trình nghệ thuật trực tiếp chọn lọc</h1>
          <p>Khám phá sự kiện, xem giá vé và chọn vị trí trên sơ đồ ghế.</p>
        </div>
        <Filters />
      </section>
      <div className="catalog-mobile-search">
        <Search />
        <Input
          placeholder="Tìm theo tên sự kiện, nghệ sĩ..."
          aria-label="Tìm theo tên sự kiện"
          disabled
          title="Tìm kiếm chưa khả dụng"
        />
      </div>
      <Filters mobile />
      <div
        className="catalog-heading"
        data-catalog-state={
          loading
            ? "loading"
            : error
              ? "error"
              : data?.items.length
                ? "ready"
                : "empty"
        }
      >
        <h2>
          {loading ? "Đang tải danh sách sự kiện…" : "Sự kiện đang mở bán"}{" "}
          {!loading && <small>{data?.items.length ?? 0} suất trên trang</small>}
        </h2>
        <select
          aria-label="Sắp xếp sự kiện"
          disabled
          title="Hiện sắp theo thời gian"
        >
          <option>Gần nhất theo thời gian</option>
        </select>
      </div>
      {!loading && error && (
        <p className="catalog-error-banner">
          <CircleAlert size={16} />
          {error}
        </p>
      )}
      {loading ? (
        <div aria-label="Đang tải danh sách">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="catalog-skeleton" key={i}>
              <Skeleton className="catalog-skeleton-poster">
                <ImageIcon aria-hidden="true" />
              </Skeleton>
              <div className="catalog-skeleton-copy">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <div className="catalog-skeleton-meta">
                  <Skeleton className="size-3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <div className="catalog-skeleton-meta">
                  <Skeleton className="size-3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <div className="catalog-skeleton-action">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <section className="catalog-state" role="alert">
          <CloudOff />
          <h2>Không tải được danh sách</h2>
          <p>{error}</p>
          <Button onClick={reload}>Thử lại</Button>
        </section>
      ) : data?.items.length ? (
        <div className="catalog-list">
          {data.items.map((item) => (
            <article key={item.id} className="catalog-row">
              <div className="catalog-poster">
                <EventPoster
                  path={item.posterPath}
                  mobilePath={item.mobilePosterPath}
                  name={item.name}
                />
                <span className="poster-sale">MỞ BÁN</span>
                <span className="poster-date">
                  {shortDate(item.startTime).replaceAll("-", "/")}
                </span>
              </div>
              <div className="catalog-info">
                <div className="catalog-badges">
                  <span className="sale-badge">Đang mở bán</span>
                  {item.categoryLabel && (
                    <span className="genre-badge">{item.categoryLabel}</span>
                  )}
                </div>
                <h3>{item.name}</h3>
                <div className="catalog-meta">
                  <span>
                    <CalendarDays className="desktop-only" />
                    <Schedule className="mobile-only" />
                    {formatShowtime(item.startTime)}
                  </span>
                  <span>
                    <MapPin />
                    {item.location}
                  </span>
                </div>
                <p className="catalog-tiers">
                  Hạng ghế:{" "}
                  {item.categories
                    .map((c) => `${c.name} (${formatVndCompact(c.price)})`)
                    .join(" · ")}
                </p>
              </div>
              <div className="catalog-action">
                <div>
                  <small>Giá vé từ</small>
                  <strong>{formatVnd(item.minPrice)}</strong>
                </div>
                <Button asChild>
                  <Link href={`/shows/${item.id}`}>
                    Xem chi tiết <ArrowRight />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="catalog-state">
          <SearchX />
          <h2>Không tìm thấy sự kiện nào</h2>
          <p>Chưa có suất diễn đang mở bán. Vui lòng quay lại sau.</p>
          <Button variant="outline" onClick={reload}>
            Tải lại danh sách
          </Button>
        </section>
      )}
      <div className="catalog-pagination">
        {!loading && (
          <p>
            Hiển thị {data?.items.length ?? 0} suất đang mở bán trên trang này
          </p>
        )}
        <div>
          <span>Trang {history.length + 1}</span>
          <Button
            variant="outline"
            disabled={loading || !!error || !history.length}
            onClick={() => {
              const previous = history.at(-1) ?? null;
              setHistory((v) => v.slice(0, -1));
              next(previous);
            }}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            disabled={loading || !!error || !data?.nextCursor}
            onClick={() => {
              setHistory((v) => [...v, cursor]);
              next(data?.nextCursor ?? null);
            }}
          >
            Sau
          </Button>
        </div>
      </div>
      {!loading && (
        <div className="catalog-notice">
          <Info />
          <p>
            Chọn suất diễn để xem giá từng hạng và sơ đồ chỗ ngồi. Ghế chỉ được
            giữ sau khi máy chủ xác nhận thành công.
          </p>
        </div>
      )}
    </>
  );
}
