import { Prisma } from '@prisma/client';
// T-19 integration contract: replace the lateral no-inventory source with the
// authoritative K-01 hold/ticket joins when those gates open. Do not pass owner
// identity to a public projection. Expiry always compares with database time.
export const SEAT_STATUS_SQL = Prisma.sql`CASE
  WHEN inventory.sold THEN 'SOLD'
  WHEN inventory."expiresAt" > clock_timestamp() THEN 'HELD'
  ELSE 'AVAILABLE' END`;
