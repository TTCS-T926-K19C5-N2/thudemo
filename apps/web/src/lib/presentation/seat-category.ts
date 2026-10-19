/** Shared presentation uses category identity, never array order. */
export function seatCategoryToken(
  name: string,
): "--seat-vip" | "--seat-standard" | "--seat-balcony" {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (
    normalized.includes("ban cong") ||
    normalized.includes("economy") ||
    normalized.includes("pho thong") ||
    normalized === "b"
  )
    return "--seat-balcony";
  if (
    normalized.includes("vip") ||
    normalized.includes("premium") ||
    normalized === "s"
  )
    return "--seat-vip";
  return "--seat-standard";
}
