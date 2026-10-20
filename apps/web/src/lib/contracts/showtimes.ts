import { ApiError, object } from "@/lib/api/client";
export type SeatStatus = "AVAILABLE" | "HELD" | "SOLD";
export type SaleStatus = "DRAFT" | "ON_SALE" | "CLOSED";
export type Seat = {
  id: string;
  row: string;
  seatNumber: number;
  category: string;
  price: number | null;
  status: SeatStatus;
};
export type Category = { id: string; name: string; price: number | null };
export type CatalogItem = {
  id: string;
  eventId: string;
  isDemo: boolean;
  name: string;
  description: string;
  location: string;
  startTime: string;
  minPrice: number;
  maxPrice: number;
  posterPath: string | null;
  mobilePosterPath: string | null;
  categoryLabel: string | null;
  categories: { name: string; price: number | null }[];
};
export type CatalogPage = {
  items: CatalogItem[];
  nextCursor: string | null;
  totalCount: number;
};
export type PublicShowtime = {
  id: string;
  startTime: string;
  status: SaleStatus;
  isDemo: boolean;
  event: {
    id: string;
    name: string;
    description: string;
    location: string;
    posterPath: string | null;
    mobilePosterPath: string | null;
    bannerPath: string | null;
    categoryLabel: string | null;
  };
  categories: { name: string; price: number | null }[];
  siblings: {
    id: string;
    startTime: string;
    status: SaleStatus;
    isDemo: boolean;
    categories: { name: string; price: number | null }[];
  }[];
};
export type OwnedShowtime = {
  id: string;
  startTime: string;
  status: SaleStatus;
  isDemo: boolean;
  structureLocked: boolean;
  event: { id: string; name: string; location: string };
  categories: Category[];
  _count: { seats: number };
  siblings: { id: string; startTime: string; status: SaleStatus }[];
  maxTicketsPerUser: number | null;
};
export type MapIssue = { index: number | null; field: string; message: string };
export type SeatDocument = {
  seats: { row: string; seatNumber: number; category: string }[];
};
const invalid = (): never => {
  throw new ApiError(
    "Dữ liệu phản hồi không hợp lệ. Hãy tải lại.",
    502,
    "INVALID_RESPONSE",
  );
};
export const string = (v: unknown): string =>
  typeof v === "string" ? v : invalid();
const number = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : invalid();
const price = (v: unknown): number | null =>
  v === null
    ? null
    : Number.isInteger(v) && number(v) >= 0
      ? number(v)
      : invalid();
const nullableString = (v: unknown): string | null =>
  v === null ? null : string(v);
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : invalid());
const time = (v: unknown): string =>
  Number.isNaN(Date.parse(string(v))) ? invalid() : string(v);
const sale = (v: unknown): SaleStatus =>
  v === "DRAFT" || v === "ON_SALE" || v === "CLOSED" ? v : invalid();
export function posterPath(value: unknown): string | null {
  const path = nullableString(value);
  return path && /^\/images\/events\/([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.\u00C0-\u024F\u1EA0-\u1EF9-]+\.(jpg|png|webp)$/.test(path)
    ? path
    : null;
}
const categories = (v: unknown) =>
  array(v).map((item) => {
    const c = object(item);
    return { name: string(c.name), price: price(c.price) };
  });
const siblings = (v: unknown) =>
  array(v).map((item) => {
    const s = object(item);
    return {
      id: string(s.id),
      startTime: time(s.startTime),
      status: sale(s.status),
      isDemo: s.isDemo === true,
    };
  });
export function decodeCatalog(v: unknown): CatalogPage {
  const page = object(v);
  const rawItems = array(page.items);
  return {
    nextCursor: nullableString(page.nextCursor),
    totalCount:
      page.totalCount === undefined ? rawItems.length : number(page.totalCount),
    items: rawItems.map((item) => {
      const i = object(item);
      return {
        id: string(i.id),
        eventId: string(i.eventId),
        isDemo: i.isDemo === true,
        name: string(i.name),
        description: string(i.description),
        location: string(i.location),
        startTime: time(i.startTime),
        minPrice: number(i.minPrice),
        maxPrice: number(i.maxPrice),
        posterPath: posterPath(i.posterPath),
        mobilePosterPath: posterPath(i.mobilePosterPath),
        categoryLabel: nullableString(i.categoryLabel),
        categories: categories(i.categories),
      };
    }),
  };
}
export function decodePublicShowtime(v: unknown): PublicShowtime {
  const s = object(v),
    e = object(s.event);
  return {
    id: string(s.id),
    startTime: time(s.startTime),
    status: sale(s.status),
    isDemo: s.isDemo === true,
    event: {
      id: string(e.id),
      name: string(e.name),
      description: string(e.description),
      location: string(e.location),
      posterPath: posterPath(e.posterPath),
      mobilePosterPath: posterPath(e.mobilePosterPath),
      bannerPath: posterPath(e.bannerPath),
      categoryLabel: nullableString(e.categoryLabel),
    },
    categories: categories(s.categories),
    siblings: array(s.siblings).map((item) => {
      const slot = object(item);
      return {
        id: string(slot.id),
        startTime: time(slot.startTime),
        status: sale(slot.status),
        isDemo: slot.isDemo === true,
        categories: categories(slot.categories),
      };
    }),
  };
}
export function decodeOwnedShowtime(v: unknown): OwnedShowtime {
  const s = object(v),
    e = object(s.event);
  if (typeof s.structureLocked !== "boolean") return invalid();
  return {
    id: string(s.id),
    startTime: time(s.startTime),
    status: sale(s.status),
    isDemo: s.isDemo === true,
    structureLocked: s.structureLocked,
    event: {
      id: string(e.id),
      name: string(e.name),
      location: string(e.location),
    },
    categories: array(s.categories).map((item) => {
      const c = object(item);
      return { id: string(c.id), name: string(c.name), price: price(c.price) };
    }),
    _count: { seats: number(object(s._count).seats) },
    siblings: siblings(s.siblings),
    maxTicketsPerUser:
      s.maxTicketsPerUser === null || s.maxTicketsPerUser === undefined
        ? null
        : Number.isInteger(s.maxTicketsPerUser) &&
            (s.maxTicketsPerUser as number) >= 1
          ? (s.maxTicketsPerUser as number)
          : invalid(),
  };
}
export type SalesFigures = {
  totalSeats: number;
  sold: number;
  held: number;
  available: number;
  revenue: number;
};
export type ShowtimeSales = {
  showtimeId: string;
  generatedAt: string;
  isDemo: boolean;
  totals: SalesFigures;
  categories: (SalesFigures & { name: string; price: number | null })[];
};
const count = (v: unknown): number =>
  Number.isInteger(v) && number(v) >= 0 ? number(v) : invalid();
const salesFigures = (v: unknown): SalesFigures => {
  const f = object(v);
  return {
    totalSeats: count(f.totalSeats),
    sold: count(f.sold),
    held: count(f.held),
    available: count(f.available),
    revenue: count(f.revenue),
  };
};
export function decodeShowtimeSales(v: unknown): ShowtimeSales {
  const d = object(v);
  if (typeof d.isDemo !== 'boolean') return invalid();
  return {
    showtimeId: string(d.showtimeId),
    generatedAt: time(d.generatedAt),
    isDemo: d.isDemo,
    totals: salesFigures(d.totals),
    categories: array(d.categories).map((item) => {
      const category = object(item);
      return {
        name: string(category.name),
        price: price(category.price),
        ...salesFigures(category),
      };
    }),
  };
}
export function decodeSeats(v: unknown): Seat[] {
  return array(v).map((item) => {
    const s = object(item);
    if (s.status !== "AVAILABLE" && s.status !== "HELD" && s.status !== "SOLD")
      return invalid();
    return {
      id: string(s.id),
      row: string(s.row),
      seatNumber: number(s.seatNumber),
      category: string(s.category),
      price: price(s.price),
      status: s.status,
    };
  });
}
export function decodeIssues(v: unknown): { errors: MapIssue[] } {
  const d = object(v);
  return {
    errors: array(d.errors).map((item) => {
      const i = object(item);
      return {
        index: i.index === null ? null : number(i.index),
        field: string(i.field),
        message: string(i.message),
      };
    }),
  };
}
export function decodeSeatDocument(v: unknown): SeatDocument {
  return {
    seats: array(object(v).seats).map((item) => {
      const s = object(item);
      return {
        row: string(s.row),
        seatNumber: number(s.seatNumber),
        category: string(s.category),
      };
    }),
  };
}
