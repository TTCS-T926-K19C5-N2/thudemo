"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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

function Filters({
  categories,
  selected,
  onSelect,
  mobile = false,
}: {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  mobile?: boolean;
}) {
  return (
    <div
      className={`catalog-filters ${mobile ? "mobile-only" : ""}`}
      aria-label="Lọc theo thể loại"
    >
      {["Tất cả", ...categories].map((name) => (
        <button
          key={name}
          type="button"
          className={selected === name ? "active" : ""}
          aria-pressed={selected === name}
          onClick={() => onSelect(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function getEventBadgeInfo(startTime: string, isDemo = false) {
  if (isDemo) {
    return {
      posterBadge: "LỊCH MÔ PHỎNG",
      posterClass: "poster-demo",
      statusPill: "Sơ đồ tham khảo",
      pillClass: "status-upcoming",
    };
  }
  const now = Date.now();
  const showTime = Date.parse(startTime);
  const diffDays = Math.ceil((showTime - now) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return {
      posterBadge: "ĐÃ KHÉP LẠI",
      posterClass: "poster-past",
      statusPill: "Đã diễn ra",
      pillClass: "status-past",
    };
  }
  if (diffDays <= 20) {
    return {
      posterBadge: "SẮP DIỄN RA",
      posterClass: "poster-soon",
      statusPill: "Sắp diễn ra",
      pillClass: "status-soon",
    };
  }
  if (diffDays <= 50) {
    return {
      posterBadge: "ĐANG MỞ BÁN",
      posterClass: "poster-onsale",
      statusPill: "Đang mở bán vé",
      pillClass: "status-onsale",
    };
  }
  return {
    posterBadge: "SẮP TỚI",
    posterClass: "poster-upcoming",
    statusPill: "Sắp tới",
    pillClass: "status-upcoming",
  };
}

export function EventCatalog() {
  const [data, setData] = useState<CatalogPage | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<(string | null)[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [sort, setSort] = useState("soon");
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
  const categories = useMemo(
    () =>
      [...new Set((data?.items ?? []).flatMap((item) => item.categoryLabel ?? []))]
        .filter(Boolean)
        .toSorted((a, b) => a.localeCompare(b, "vi")),
    [data],
  );
  const visibleItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("vi-VN");
    const items = (data?.items ?? []).filter((item) => {
      const matchesCategory = category === "Tất cả" || item.categoryLabel === category;
      const searchable = [
        item.name,
        item.description,
        item.location,
        item.categoryLabel ?? "",
        ...item.categories.map((tier) => tier.name),
      ]
        .join(" ")
        .toLocaleLowerCase("vi-VN");
      return matchesCategory && (!term || searchable.includes(term));
    });
    return items.toSorted((a, b) => {
      if (sort === "price-asc") return a.minPrice - b.minPrice;
      if (sort === "price-desc") return b.minPrice - a.minPrice;
      return Date.parse(a.startTime) - Date.parse(b.startTime);
    });
  }, [category, data, query, sort]);
  const featuredEvent = data?.items[0];
  const demoCatalog = !!data?.items.length && data.items.every((item) => item.isDemo);
  const featuredBadge = featuredEvent
    ? getEventBadgeInfo(featuredEvent.startTime, featuredEvent.isDemo)
    : null;
  return (
    <>
      <section className="catalog-hero">
        <div className="catalog-hero-art" aria-hidden="true">
          <Image
            src="/images/hero-symphony-banner.png"
            alt=""
            fill
            priority
            sizes="100vw"
          />
        </div>
        <div>
          <span className="season-label">SÂN KHẤU · HÒA NHẠC · NGHỆ THUẬT</span>
          <span className="season-subtitle">Sân khấu · Âm nhạc · Nghệ thuật</span>
          <h1>Nơi nghệ thuật chạm đến cảm xúc.</h1>
          <p>Khám phá những đêm diễn, hòa nhạc và câu chuyện trên sân khấu.</p>
          <p className="catalog-hero-note">
            Dữ liệu lịch, giá và sơ đồ mô phỏng luôn được đánh dấu rõ ràng.
          </p>
          <div className="catalog-hero-actions">
            <Button asChild size="lg">
              <a href="#lich-dien">Khám phá sự kiện <ArrowRight /></a>
            </Button>
            <a className="catalog-hero-secondary" href="#featured">
              Câu chuyện sân khấu <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <div className="catalog-hero-count" aria-live="polite">
          <strong>
            {loading
              ? "—"
              : (data?.totalCount ?? data?.items.length ?? 0)}
          </strong>
          <span>chương trình<br />đang được giới thiệu</span>
        </div>
      </section>
      {!loading && !error && featuredEvent && (
        <section className="catalog-featured" id="featured" aria-labelledby="catalog-featured-title">
          <Link href={`/shows/${featuredEvent.id}`} className="catalog-featured-image" aria-label={`Xem ${featuredEvent.name}`}>
            <EventPoster
              path={featuredEvent.posterPath}
              mobilePath={featuredEvent.mobilePosterPath}
              name={featuredEvent.name}
              sizes="(max-width: 760px) 100vw, 48vw"
            />
          </Link>
          <div className="catalog-featured-copy">
            <span className="catalog-eyebrow">
              {featuredEvent.isDemo
                ? "CHƯƠNG TRÌNH TIÊU BIỂU · LỊCH MÔ PHỎNG"
                : "CÂU CHUYỆN SÂN KHẤU"}
            </span>
            <div className="catalog-featured-badges">
              <span className="catalog-featured-category">{featuredEvent.categoryLabel ?? "Nghệ thuật biểu diễn"}</span>
              {featuredBadge && (
                <span className={`status-pill ${featuredBadge.pillClass}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {featuredBadge.statusPill}
                </span>
              )}
            </div>
            <h2 id="catalog-featured-title">{featuredEvent.name}</h2>
            <p className="catalog-featured-meta">
              <Schedule /> {formatShowtime(featuredEvent.startTime)}
            </p>
            <p className="catalog-featured-meta">
              <MapPin /> {featuredEvent.location}
            </p>
            <div className="catalog-featured-action">
              <div>
                <small>{featuredEvent.isDemo ? "Giá tham khảo từ" : "Vé từ"}</small>
                <strong>{formatVnd(featuredEvent.minPrice)}</strong>
              </div>
              <Button asChild>
                <Link href={`/shows/${featuredEvent.id}`}>
                  {featuredEvent.isDemo ? "Xem nội dung & sơ đồ" : "Khám phá chương trình"} <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}
      <section className="catalog-mobile-intro" aria-label="Khám phá sự kiện">
        <span>VÉ SỰ KIỆN · TRẢI NGHIỆM TRỰC TIẾP</span>
        <h1>Những đêm diễn đáng mong đợi.</h1>
        <p>Lịch diễn, địa điểm và giá vé — gọn trong một trải nghiệm.</p>
      </section>
      <div className="catalog-mobile-search">
        <Search />
        <Input
          placeholder="Tìm theo tên sự kiện, nghệ sĩ..."
          aria-label="Tìm theo tên sự kiện"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="catalog-toolbar">
        <div className="catalog-search-desktop">
          <Search />
          <Input
            placeholder="Tìm sự kiện, địa điểm, hạng vé..."
            aria-label="Tìm sự kiện trên trang hiện tại"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Filters categories={categories} selected={category} onSelect={setCategory} />
        <Filters mobile categories={categories} selected={category} onSelect={setCategory} />
      </div>
      <div
        id="lich-dien"
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
        <div className="catalog-section-copy">
          <h2>
            {loading
              ? "Đang tải danh sách sự kiện…"
              : `Khám phá ${data?.totalCount ?? data?.items.length ?? 0} chương trình`}{" "}
            {!loading && <small>{visibleItems.length} kết quả trên trang này</small>}
          </h2>
          <p>
            {demoCatalog
              ? "Thông tin chương trình được biên tập từ nguồn tham khảo; ngày diễn, giá và ghế là dữ liệu mô phỏng."
              : "Khám phá chương trình nghệ thuật, lịch diễn và chọn vị trí ghế ngồi trực tuyến."}
          </p>
        </div>
        <select
          aria-label="Sắp xếp sự kiện"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="soon">Gần nhất</option>
          <option value="price-asc">{demoCatalog ? "Giá tham khảo thấp trước" : "Giá thấp trước"}</option>
          <option value="price-desc">{demoCatalog ? "Giá tham khảo cao trước" : "Giá cao trước"}</option>
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
      ) : visibleItems.length ? (
        <div className="catalog-list catalog-grid">
          {visibleItems.map((item) => {
            const badge = getEventBadgeInfo(item.startTime, item.isDemo);
            return (
            <article key={item.id} className="catalog-card">
              <div className="catalog-poster">
                <EventPoster
                  path={item.posterPath}
                  mobilePath={item.mobilePosterPath}
                  name={item.name}
                  sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 900px) calc(50vw - 40px), 420px"
                />
                <span className={`poster-sale ${badge.posterClass}`}>
                  {badge.posterBadge}
                </span>
                <span className="catalog-card-date">
                  <CalendarDays />
                  {shortDate(item.startTime)}
                </span>
              </div>
              <div className="catalog-info">
                <div className="catalog-badges">
                  {item.categoryLabel && (
                    <span className="genre-badge">{item.categoryLabel}</span>
                  )}
                  <span className={`status-pill ${badge.pillClass}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {badge.statusPill}
                  </span>
                </div>
                <h3>{item.name}</h3>
                <div className="catalog-meta">
                  <span>
                    <Schedule />
                    {formatShowtime(item.startTime)}
                  </span>
                  <span>
                    <MapPin />
                    {item.location}
                  </span>
                </div>
                <ul className="catalog-tiers" aria-label={item.isDemo ? "Các hạng ghế tham khảo" : "Các hạng vé"}>
                  {item.categories.slice(0, 3).map((tier) => (
                    <li key={tier.name}>
                      <span>{tier.name}</span>
                      <b>{formatVndCompact(tier.price)}</b>
                    </li>
                  ))}
                  {item.categories.length > 3 && (
                    <li className="catalog-tier-more">+{item.categories.length - 3} hạng</li>
                  )}
                </ul>
              </div>
              <div className="catalog-action">
                <div>
                  <small>{item.isDemo ? "Giá tham khảo từ" : "Giá vé từ"}</small>
                  <strong>{formatVnd(item.minPrice)}</strong>
                </div>
                <Button asChild>
                  <Link href={`/shows/${item.id}`}>
                    {item.isDemo ? "Xem thông tin & sơ đồ" : "Xem lịch & ghế"} <ArrowRight />
                  </Link>
                </Button>
              </div>
            </article>
            );
          })}
        </div>
      ) : (
        <section className="catalog-state">
          <SearchX />
          <h2>{data?.items.length ? "Chưa có suất phù hợp" : "Chưa có suất diễn mở bán"}</h2>
          <p>
            {data?.items.length
              ? "Thử đổi từ khóa hoặc thể loại để xem các chương trình khác."
              : "Ban tổ chức chưa công bố lịch bán vé. Vui lòng quay lại sau."}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              if (data?.items.length) {
                setQuery("");
                setCategory("Tất cả");
              } else reload();
            }}
          >
            {data?.items.length ? "Xóa bộ lọc" : "Tải lại danh sách"}
          </Button>
        </section>
      )}
      <div className="catalog-pagination">
        {!loading && (
          <p>
            {visibleItems.length} suất trên trang này
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
      {!loading && !error && (
        <div className="catalog-notice">
          <Info />
          <p>
            {demoCatalog
              ? "Ngày diễn, giá và sơ đồ ghế mang tính mô phỏng; chức năng đặt vé không áp dụng cho các suất này."
              : "Thông tin mở bán và tình trạng vé được cập nhật theo thời gian thực. Chọn suất diễn để xem sơ đồ ghế và đặt vé."}
          </p>
        </div>
      )}
    </>
  );
}
