/** Shared presentation uses category identity, never array order. */
export function seatCategoryToken(
  name: string,
): "--seat-vip" | "--seat-standard" | "--seat-balcony" {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("ban cong")) return "--seat-balcony";
  if (normalized.includes("vip")) return "--seat-vip";
  return "--seat-standard";
}
