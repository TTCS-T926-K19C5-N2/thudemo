import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScannerCryptoService } from './scanner-crypto.service.js';
type Ticket = {
  code: string;
  status: 'valid' | 'checked_in' | 'cancelled';
  checkedInAt: string | null;
  seatLabel: string;
  ticketType: string;
};
const fingerprint = (ticket: Ticket) =>
  JSON.stringify([
    ticket.code,
    ticket.status,
    ticket.checkedInAt,
    ticket.seatLabel,
    ticket.ticketType,
  ]);
@Injectable()
export class ScannerSnapshotService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ScannerCryptoService,
  ) {}
  async snapshot(
    showtimeId: string,
    since: string | undefined,
    user: { id: string; roles: string[] },
  ) {
    const uuid =
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
    // Previous timestamp cursors deliberately fall back to a full refresh.
    if (
      since &&
      !uuid.test(since) &&
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(since)
    )
      throw new BadRequestException('Cursor danh sách vé không hợp lệ.');
    return this.db.$transaction(
      async (tx) => {
        const show = await tx.showtime.findUnique({
          where: { id: showtimeId },
          select: { event: { select: { name: true, organizerId: true } } },
        });
        if (!show) throw new NotFoundException('Không tìm thấy suất diễn.');
        const elevated =
          user.roles.includes('ADMIN') ||
          (user.roles.includes('ORGANIZER') &&
            show.event.organizerId === user.id);
        if (
          !elevated &&
          (!user.roles.includes('STAFF') ||
            !(await tx.checkInPermission.count({
              where: { userId: user.id, gate: { showtimeId } },
            })))
        )
          throw new ForbiddenException('Chưa được phân công cửa cho suất này.');
        const rows = await tx.$queryRaw<
          {
            code: string;
            status: Ticket['status'];
            checkedInAt: Date | null;
            seatLabel: string;
            ticketType: string;
          }[]
        >(Prisma.sql`
        SELECT oi.id::text AS code,CASE WHEN o.status<>'PAID' OR t.status='CANCELLED' THEN 'cancelled'
          WHEN oi."checkedInAt" IS NOT NULL OR t.status='CHECKED_IN' THEN 'checked_in' ELSE 'valid' END AS status,
          COALESCE(oi."checkedInAt",t."checkedInAt") AS "checkedInAt",s.row||'-'||s."seatNumber" AS "seatLabel",oi."categoryName" AS "ticketType"
        FROM order_items oi JOIN orders o ON o.id=oi."orderId" JOIN seats s ON s.id=oi."seatId"
        JOIN tickets t ON t."orderId"=o.id AND t."seatId"=oi."seatId"
        WHERE o."showtimeId"=${showtimeId}::uuid AND s."showtimeId"=o."showtimeId" ORDER BY oi.id`);
        const tickets: Ticket[] = rows.map((r) => ({
          ...r,
          checkedInAt: r.checkedInAt?.toISOString() ?? null,
        }));
        let previous: Ticket[] | undefined;
        if (since && uuid.test(since)) {
          const [cursor] = await tx.$queryRaw<
            { tickets: Ticket[] }[]
          >(Prisma.sql`SELECT tickets FROM scanner_snapshot_cursors
          WHERE id=${since}::uuid AND "showtimeId"=${showtimeId}::uuid AND "staffId"=${user.id}::uuid AND "expiresAt">clock_timestamp()`);
          previous = cursor?.tickets;
        }
        const keys = this.crypto.getPublicKeys(),
          active = this.crypto.getPublicKeyInfo();
        const version = createHash('sha256')
            .update(JSON.stringify({ tickets, keys }))
            .digest('hex'),
          cursor = randomUUID();
        await tx.$executeRaw(Prisma.sql`INSERT INTO scanner_snapshot_cursors(id,"showtimeId","staffId",version,tickets) VALUES
        (${cursor}::uuid,${showtimeId}::uuid,${user.id}::uuid,${version},${JSON.stringify(tickets)}::jsonb)`);
        // Cache-only cursors expire. Pending scans/admissions/audit are never pruned.
        await tx.$executeRaw(Prisma.sql`DELETE FROM scanner_snapshot_cursors WHERE id IN
        (SELECT id FROM scanner_snapshot_cursors WHERE "staffId"=${user.id}::uuid AND "expiresAt"<clock_timestamp() LIMIT 100)`);
        const prior = new Map(previous?.map((t) => [t.code, fingerprint(t)]));
        const changed = previous
          ? tickets.filter((t) => prior.get(t.code) !== fingerprint(t))
          : tickets.filter((t) => t.status !== 'cancelled');
        if (previous) {
          const current = new Set(tickets.map((t) => t.code));
          for (const old of previous)
            if (!current.has(old.code))
              changed.push({ ...old, status: 'cancelled' });
        }
        const [clock] = await tx.$queryRaw<{ now: Date }[]>(
          Prisma.sql`SELECT clock_timestamp() AS now`,
        );
        return {
          protocolVersion: 2,
          showtimeId,
          showtimeName: show.event.name,
          generatedAt: clock.now.toISOString(),
          version,
          cursor,
          mode: previous ? 'delta' : 'full',
          totalTickets: tickets.filter((t) => t.status !== 'cancelled').length,
          publicKey: { ...active, verificationKeys: keys },
          publicKeys: keys.map((k) => ({
            keyId: k.keyId,
            key: k.key,
            publicKey: k.key,
          })),
          tickets: changed,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
      },
    );
  }
}
