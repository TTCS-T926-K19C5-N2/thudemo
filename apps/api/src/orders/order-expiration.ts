export function isOrderExpired(
  order: { status: string; expiresAt: Date | string },
  now: Date = new Date(),
): boolean {
  if (order.status === 'EXPIRED') return true;
  if (order.status !== 'PENDING') return false;
  const expiry =
    typeof order.expiresAt === 'string'
      ? new Date(order.expiresAt)
      : order.expiresAt;
  return now.getTime() >= expiry.getTime();
}
