"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  ArrowRight,
  Armchair,
  Info,
  Ticket,
  Theater,
  Person,
  Schedule,
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
import { seatCategoryToken } from "@/lib/presentation/seat-category";
import { EventPoster } from "./event-poster";
import { MobileShowHeader } from "@/components/layout/product-layout";

type Section = { heading: string | null; lines: string[] };
type Credit = { role: string; name: string };
type Artist = { name: string; character: string | null; role: string | null };

const TZ = "Asia/Ho_Chi_Minh";

/** Split organiser copy on 【HEADING】 markers into ordered sections. */
function parseSections(raw: string): Section[] {
  const parts = raw.split(/【([^】]+)】/);
  const toLines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const sections: Section[] = [];
  if (parts[0]?.trim()) sections.push({ heading: null, lines: toLines(parts[0]) });
  for (let i = 1; i < parts.length; i += 2)
    sections.push({ heading: parts[i].trim(), lines: toLines(parts[i + 1] ?? "") });
  return sections;
}

const bullet = (line: string) => line.replace(/^[•·\-–]\s*/, "");
const isBullet = (line: string) => /^[•·]/.test(line);
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toUpperCase();
function proseWithLinks(line: string) {
  return line.split(/(https:\/\/[^\s]+)/g).map((part, index) =>
    part.startsWith("https://") ? (
      <a key={index} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function splitPair(line: string): [string, string] | null {
  const text = bullet(line);
  const at = text.indexOf(":");
  if (at <= 0 || at > 40) return null;
  return [text.slice(0, at).trim(), text.slice(at + 1).trim()];
}

function parseArtist(line: string): Artist {
  const pair = splitPair(line);
  let rest = pair ? pair[1] : bullet(line);
  let role: string | null = null;
  const dash = rest.lastIndexOf(" - ");
  if (dash > 0) {
    role = rest.slice(dash + 3).trim();
    rest = rest.slice(0, dash).trim();
  }
  if (role?.toLocaleLowerCase("vi-VN") === "diễn viên") role = null;
  let character: string | null = null;
  const paren = rest.match(/\(([^)]+)\)\s*$/);
  if (paren) {
    character = paren[1].replace(/^vai\s+/i, "").trim();
    rest = rest.slice(0, paren.index).trim();
  }
  return { name: rest, character, role };
}

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words.at(-2)?.[0] ?? "") + (words.at(-1)?.[0] ?? "")).toUpperCase();
}

function dateParts(value: string) {
  const d = new Date(value);
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, ...o }).format(d);
  return {
    day: f({ day: "2-digit" }),
    month: `Tháng ${Number(f({ month: "numeric" }))}`,
    year: f({ year: "numeric" }),
    weekday: f({ weekday: "long" }),
    time: f({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function splitLocation(location: string) {
  const at = location.indexOf(" - ");
  return at > 0
    ? { venue: location.slice(0, at), address: location.slice(at + 3) }
    : { venue: location, address: "" };
}

function TierDot({ name }: { name: string }) {
  return (
    <i
      className="evd-tier-dot"
      aria-hidden="true"
      style={{ "--tier": `var(${seatCategoryToken(name)})` } as CSSProperties}
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="evd" aria-busy="true" aria-label="Đang tải thông tin sự kiện">
      <Skeleton className="evd-skeleton-hero" />
      <div className="evd-body">
        <div className="evd-main">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

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

  const content = useMemo(() => {
    if (!show) return null;
    const sections = parseSections(show.event.description);
    const lead: string[] = [];
    let credits: Credit[] = [];
    let artists: Artist[] = [];
    let attend: { label: string | null; text: string }[] = [];
    const other: Section[] = [];
    for (const s of sections) {
      const key = s.heading ? normalize(s.heading) : "";
      if (!s.heading) lead.push(...s.lines);
      else if (key.includes("SANG TAO") || key.includes("E-KIP"))
        credits = s.lines.flatMap((l) => {
          const p = splitPair(l);
          return p ? [{ role: p[0], name: p[1] }] : [];
        });
      else if (key.includes("NGHE SI")) artists = s.lines.map(parseArtist);
      else if (key.includes("DIA DIEM") || key.includes("QUY DINH"))
        attend = s.lines.map((l) => {
          const p = splitPair(l);
          return p ? { label: p[0], text: p[1] } : { label: null, text: bullet(l) };
        });
      else if (!key.includes("NGUON THAM KHAO") && !key.includes("DU LIEU MO PHONG"))
        other.push(s);
    }
    return { lead, credits, artists, attend, other };
  }, [show]);

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
  if (!show || !content) return <DetailSkeleton />;

  const tiers = show.categories.toSorted((a, b) => (b.price ?? 0) - (a.price ?? 0));
  const prices = tiers.flatMap((c) => (c.price === null ? [] : [c.price]));
  const minPrice = prices.length ? Math.min(...prices) : null;
  const onSale = show.siblings.filter((s) => s.status === "ON_SALE");
  const nextOnSale = onSale[0] ?? show.siblings[0];
  const { venue, address } = splitLocation(show.event.location);
  const genre = show.event.categoryLabel ?? "Nghệ thuật biểu diễn";
  const isStageProduction = /kịch|chèo|sân khấu/i.test(genre);

  return (
    <div className="evd">
      <MobileShowHeader href="/" title="Chi tiết sự kiện" />
      <nav className="detail-breadcrumb evd-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <Link href="/">Sự kiện</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{show.event.name}</span>
      </nav>

      <section className="evd-hero" aria-labelledby="evd-title">
        <EventPoster
          path={show.event.bannerPath ?? show.event.posterPath}
          name={show.event.name}
          sizes="100vw"
          className="evd-backdrop"
          decorative
        />
        <div className="evd-hero-inner">
          <EventPoster
            path={show.event.posterPath ?? show.event.bannerPath}
            mobilePath={show.event.mobilePosterPath}
            sizes="(max-width:600px) 140px, 280px"
            name={show.event.name}
            className="evd-poster"
          />
          <div className="evd-hero-copy">
            <span className="evd-genre">
              <Theater size={14} /> {genre}
            </span>
            <h1 id="evd-title">{show.event.name}</h1>
            {content.lead[0] && (
              <p className="evd-hero-synopsis">{bullet(content.lead[0])}</p>
            )}
            <ul className="evd-facts">
              <li>
                <CalendarDays />
                <div>
                  <small>{onSale.length ? "Suất gần nhất" : "Thời gian"}</small>
                  <b>{formatShowtime(nextOnSale?.startTime ?? show.startTime)}</b>
                </div>
              </li>
              <li>
                <MapPin />
                <div>
                  <small>Địa điểm</small>
                  <b>{venue}</b>
                  {address && <span>{address}</span>}
                </div>
              </li>
              <li>
                <Schedule />
                <div>
                  <small>Lịch diễn</small>
                  <b>
                    {show.siblings.length} suất
                    {onSale.length > 0 && ` · ${onSale.length} đang mở bán`}
                  </b>
                </div>
              </li>
            </ul>
            <div className="evd-buy">
              <div>
                <small>Giá vé từ</small>
                <strong>{minPrice === null ? "Liên hệ" : formatVnd(minPrice)}</strong>
              </div>
              {onSale.length > 0 ? (
                <Button asChild size="lg" className="evd-buy-cta">
                  <a href="#lich-dien">
                    <Ticket /> Mua vé ngay
                  </a>
                </Button>
              ) : (
                <Button size="lg" disabled variant="outline">
                  Tạm ngưng bán vé
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="evd-body">
        <div className="evd-main">
          <section id="lich-dien" className="evd-section" aria-labelledby="evd-showtimes">
            <header className="evd-section-head">
              <h2 id="evd-showtimes">
                <CalendarDays /> Lịch diễn &amp; giá vé
              </h2>
              <p>Khám phá lịch diễn, hạng vé và sơ đồ ghế theo từng suất.</p>
            </header>
            {show.siblings.length === 0 ? (
              <p className="evd-empty">
                <Info /> Ban tổ chức chưa công bố lịch diễn.
              </p>
            ) : (
              <ol className="evd-showtimes">
                {show.siblings.map((s) => {
                  const d = dateParts(s.startTime);
                  const open = s.status === "ON_SALE";
                  const sPrices = s.categories.flatMap((c) =>
                    c.price === null ? [] : [c.price],
                  );
                  return (
                    <li
                      key={s.id}
                      className="evd-stub"
                      data-open={open}
                      data-current={s.id === show.id || undefined}
                    >
                      <div className="evd-stub-date" aria-hidden="true">
                        <small>{d.month}</small>
                        <b>{d.day}</b>
                        <span>{d.year}</span>
                      </div>
                      <div className="evd-stub-body">
                        <h3>
                          <span className="evd-stub-weekday">{d.weekday}</span>
                          <span className="evd-stub-time">{d.time}</span>
                          <span className="sr-only">{formatShowtime(s.startTime)}</span>
                        </h3>
                        <p>
                          <MapPin size={14} /> {venue}
                        </p>
                        {open ? (
                          <ul className="evd-stub-tiers" aria-label="Hạng vé">
                            {s.categories
                              .toSorted((a, b) => (b.price ?? 0) - (a.price ?? 0))
                              .map((c) => (
                                <li key={c.name}>
                                  <TierDot name={c.name} />
                                  <span>{c.name}</span>
                                  <b>{formatVnd(c.price)}</b>
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="evd-stub-closed">
                            <Info size={14} /> Suất diễn đã đóng bán.
                          </p>
                        )}
                      </div>
                      <div className="evd-stub-action">
                        {open ? (
                          <>
                            <small>
                              Từ{" "}
                              <b>{sPrices.length ? formatVnd(Math.min(...sPrices)) : "Liên hệ"}</b>
                            </small>
                            <Button asChild>
                              <Link href={`/shows/${s.id}/seats`}>
                                <Armchair /> Chọn ghế <ArrowRight />
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <Button disabled variant="outline">
                            Đã đóng bán
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {content.lead.length > 0 && (
            <section className="evd-section" aria-labelledby="evd-about">
              <header className="evd-section-head">
                <h2 id="evd-about">
                  <Theater />
                  {isStageProduction ? "Nội dung vở diễn" : "Nội dung chương trình"}
                </h2>
                <p>Tóm tắt tác phẩm và bối cảnh biểu diễn</p>
              </header>
              <div className="evd-prose evd-synopsis">
                {content.lead.map((line, i) => (
                  <p key={i}>{bullet(line)}</p>
                ))}
              </div>
            </section>
          )}

          {content.credits.length > 0 && (
            <section className="evd-section" aria-labelledby="evd-credits">
              <header className="evd-section-head">
                <h2 id="evd-credits">
                  <Person /> Ê-kíp sáng tạo
                </h2>
              </header>
              <dl className="evd-credits">
                {content.credits.map((c, i) => (
                  <div key={i}>
                    <dt>{c.role}</dt>
                    <dd>{c.name}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {content.artists.length > 0 && (
            <section className="evd-section" aria-labelledby="evd-cast">
              <header className="evd-section-head">
                <h2 id="evd-cast">
                  <Person /> Dàn nghệ sĩ
                </h2>
                <p className="evd-cast-note">Tư liệu nghệ sĩ thuộc các bản dựng đã được công bố; thành phần có thể thay đổi theo từng suất.</p>
              </header>
              <ul className="evd-cast">
                {content.artists.map((a, i) => (
                  <li key={i}>
                    <span className="evd-avatar" aria-hidden="true">
                      {initials(a.name)}
                    </span>
                    <div>
                      <b>{a.name}</b>
                      {a.character && <span>Vai {a.character}</span>}
                      {a.role && <small>{a.role}</small>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {content.other.map((s, i) => (
            <section key={i} className="evd-section">
              <header className="evd-section-head">
                <h2>{s.heading}</h2>
              </header>
              <div className="evd-prose">
                {s.lines.map((line, j) =>
                  isBullet(line) ? (
                    <p key={j} className="evd-prose-item">
                      {proseWithLinks(bullet(line))}
                    </p>
                  ) : (
                    <p key={j}>{proseWithLinks(line)}</p>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>

        <aside className="evd-aside" aria-label="Thông tin vé">
          <section className="evd-card">
            <h2>
              <Ticket /> Bảng giá vé
            </h2>
            {tiers.length ? (
              <ul className="evd-price-list">
                {tiers.map((c) => (
                  <li key={c.name}>
                    <TierDot name={c.name} />
                    <span>Hạng {c.name}</span>
                    <b>{formatVnd(c.price)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Giá vé sẽ được công bố sớm.</p>
            )}
            <p className="evd-card-note">
              Màu của từng hạng trùng với màu ghế trên sơ đồ.
            </p>
          </section>

          <section className="evd-card">
            <h2>
              <MapPin /> Thông tin tham dự
            </h2>
            <dl className="evd-attend">
              <div>
                <dt>Địa điểm</dt>
                <dd>
                  <b>{venue}</b>
                  {address && <span>{address}</span>}
                </dd>
              </div>
              {content.attend
                // The import data contains generic, unverified timing and dress guidance.
                .filter((a) => {
                  const details = normalize(`${a.label ?? ""} ${a.text}`);
                  return (
                    normalize(a.label ?? "") !== "DIA DIEM" &&
                    !/THOI LUONG DU KIEN|VUI LONG CO MAT TRUOC|TRANG PHUC/.test(details)
                  );
                })
                .map((a, i) =>
                  a.label ? (
                    <div key={i}>
                      <dt>{a.label}</dt>
                      <dd>{a.text}</dd>
                    </div>
                  ) : (
                    <div key={i} className="evd-attend-note">
                      <dd>{a.text}</dd>
                    </div>
                  ),
                )}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
