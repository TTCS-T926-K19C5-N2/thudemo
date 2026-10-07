export function isOrderExpired(
  order: {
    status: string;
    expiresAt?: Date | string | null;
    paymentExpiresAt?: Date | string | null;
  },
  now: Date = new Date(),
): boolean {
  if (order.status === 'EXPIRED') return true;
  if (order.status !== 'PENDING' && order.status !== 'PENDING_PAYMENT') {
    return false;
  }
  const expiryRaw = order.expiresAt ?? order.paymentExpiresAt;
  if (!expiryRaw) return false;
  const expiry =
    typeof expiryRaw === 'string'
      ? new Date(expiryRaw)
      : expiryRaw;
  return now.getTime() >= expiry.getTime();
}
