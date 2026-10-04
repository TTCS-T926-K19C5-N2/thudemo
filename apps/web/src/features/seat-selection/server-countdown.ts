// Wall clock and timezone changes do not affect the original server deadline.
export type ServerClock = { serverMs: number; receivedAt: number };
export function remainingSeconds(
  expiresAt: string,
  clock: ServerClock,
  monotonicNow: number,
): number {
  return Math.max(
    0,
    Math.ceil(
      (Date.parse(expiresAt) -
        clock.serverMs -
        Math.max(0, monotonicNow - clock.receivedAt)) /
        1000,
    ),
  );
}
export function countdownLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
