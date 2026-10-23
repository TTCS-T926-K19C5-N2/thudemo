// datetime-local has no zone. Its values in the organizer form always mean
// Vietnam civil time, independently of the browser/device's configured zone.
export function vietnamInputToUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isFinite(date.getTime()) && vietnamInputFromUtc(date) === value
    ? date.toISOString()
    : null;
}

export function vietnamInputFromUtc(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}
