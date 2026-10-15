"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  ArrowRight,
  Armchair,
  Info,
} from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import {
  decodePublicShowtime,
  type PublicShowtime as Showtime,
} from "@/lib/contracts/showtimes";
import { formatVnd, formatShowtime } from "@/lib/formatting";
import { EventPoster } from "./event-poster";
import { MobileShowHeader } from "@/components/layout/product-layout";
export function PublicShowtime({ id }: { id: string }) {
  const [show, setShow] = useState<Showtime | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/showtimes/${id}`, decodePublicShowtime, { signal: controller.signal })
      .then(setShow)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, retry]);
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
          <Button
            variant="outline"
            onClick={() => {
              setError("");
              setRetry((v) => v + 1);
            }}
          >
            Thử lại
          </Button>
          <Link href="/">Về danh sách sự kiện</Link>
        </AlertDescription>
      </Alert>
    );
  if (!show) return <Skeleton className="h-80 w-full" />;
  const prices = show.categories.flatMap((category) =>
    category.price === null ? [] : [category.price],
  );
  const priceRange = prices.length
    ? `${formatVnd(Math.min(...prices))} – ${formatVnd(Math.max(...prices))}`
    : "Chưa đặt giá";
  return (
    <>
      <MobileShowHeader href="/" title="Chi tiết suất diễn" />
      <p className="detail-breadcrumb mb-4 text-xs">
        <Link href="/">Sự kiện</Link> / {show.event.name}
      </p>
      <section className="detail-hero">
        <EventPoster
          path={show.event.bannerPath ?? show.event.posterPath}
          mobilePath={show.event.mobilePosterPath}
          sizes="(max-width:600px) 358px,400px"
          name={show.event.name}
          className="detail-poster"
        />
        <div className="detail-copy">
          <span className="genre-badge">
            {show.event.categoryLabel ?? "Chương trình nghệ thuật"}
          </span>
          <h1>{show.event.name}</h1>
          <p>{show.event.description}</p>
          <div className="catalog-meta">
            <span>
              <MapPin />
              {show.event.location}
            </span>
            <span>
              <CalendarDays />
              {formatShowtime(show.startTime)}
            </span>
          </div>
          <div className="detail-price-range">
            <span>Khoảng giá vé</span>
            <strong>{priceRange}</strong>
            <small>{show.categories.length} hạng vé</small>
          </div>
        </div>
      </section>
      <section className="detail-showtimes">
        <h2>
          <Armchair /> Lựa chọn suất diễn &amp; hạng vé
        </h2>
        <p>Chọn suất diễn phù hợp để xem vị trí ghế ngồi trên sơ đồ.</p>
        {show.siblings.map((s, index) => (
          <article
            className={`detail-showtime ${s.status === "CLOSED" ? "detail-closed" : "detail-on-sale"}`}
            key={s.id}
          >
            <div className="detail-performance-content">
              <header>
                <div>
                  <span className="performance-number">Suất {index + 1}</span>
                  <h3>{formatShowtime(s.startTime, "full")}</h3>
                  <p>{show.event.location}</p>
                </div>
                <span
                  className={
                    s.status === "CLOSED" ? "closed-badge" : "sale-badge"
                  }
                >
                  {s.status === "CLOSED" ? "Đã đóng bán" : "Đang mở bán"}
                </span>
              </header>
              {s.status === "ON_SALE" ? (
                <div className="detail-tiers">
                  {s.categories
                    .toSorted((a, b) => (b.price ?? 0) - (a.price ?? 0))
                    .map((c) => (
                      <div key={c.name} className="detail-tier">
                        <h3>{c.name}</h3>
                        <strong>{formatVnd(c.price)}</strong>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="detail-closed-notice">
                  <Info />
                  Suất diễn đã đóng bán. Không thể chọn ghế cho suất diễn này.
                </p>
              )}
            </div>
            <div className="detail-actions">
              {s.status === "ON_SALE" ? (
                <Button asChild>
                  <Link href={`/shows/${s.id}/seats`}>
                    <Armchair /> Chọn ghế <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <Button disabled>Đã đóng bán</Button>
              )}
              <small>
                {s.status === "ON_SALE"
                  ? "Xem vị trí và giá theo hạng ghế."
                  : "Không thể chọn ghế cho suất diễn này."}
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="product-panel">
        <h2>Thông tin sự kiện</h2>
        <p>{show.event.description}</p>
        <p>
          Vui lòng kiểm tra ngày giờ, địa điểm và giá vé của suất diễn trước khi
          chọn chỗ.
        </p>
      </section>
    </>
  );
}
