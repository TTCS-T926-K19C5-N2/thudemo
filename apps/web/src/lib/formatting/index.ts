export const formatVnd = (price: number | null) =>
  price === null
    ? "Chưa đặt giá"
    : `${new Intl.NumberFormat("vi-VN").format(price)} ₫`;
export const formatShowtime = (
  value: string,
  dateStyle: "full" | "short" | "medium" = "full",
) => {
  const date = new Date(value);
  const options = { timeZone: "Asia/Ho_Chi_Minh" } as const;
  const day = new Intl.DateTimeFormat("vi-VN", {
    ...options,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("vi-VN", {
    ...options,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const weekday = new Intl.DateTimeFormat("vi-VN", {
    ...options,
    weekday: "long",
  }).format(date);
  return `${dateStyle === "short" ? "" : weekday.charAt(0).toUpperCase() + weekday.slice(1) + ", "}${day} · ${time}`;
};
export const shortDate = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));

export function parseVndInput(value: string): number | null {
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(value)) return null;
  const n = Number(value.replaceAll(".", ""));
  return Number.isInteger(n) && n >= 0 && n <= 2147483647 ? n : null;
}

export const formatVndCompact = (value: number | null) =>
  value === null
    ? "Chưa đặt giá"
    : `${new Intl.NumberFormat("vi-VN").format(value / 1000)}k`;
