import { Prisma } from '@prisma/client';

export async function isRevokedTicket(
  tx: Prisma.TransactionClient,
  ticketId: string,
  showtimeId: string,
) {
  const [row] = await tx.$queryRaw<{ revoked: boolean }[]>(Prisma.sql`
    SELECT EXISTS(SELECT 1 FROM ticket_logs l JOIN tickets t ON t.id=l."ticketId"
      WHERE l.action='TRANSFERRED' AND l.detail->>'revokedQrId'=${ticketId}
        AND t."showtimeId"=${showtimeId}::uuid) AS revoked`);
  return row.revoked;
}
