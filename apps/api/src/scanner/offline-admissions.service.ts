import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScannerCryptoService } from './scanner-crypto.service.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import {
  offlineScanCommands,
  offlineScanHash,
  type OfflineScanCommand,
} from './offline-scan-contract.js';

type Ack = {
  scanId: string;
  ticketCode: string;
  status: 'synced' | 'conflict' | 'rejected';
  code: string;
  message: string;
};
type Admission = {
  id: string;
  requestId: string;
  enteredAt: Date;
  gateId: string;
  gateName: string;
  staffId: string;
};
@Injectable()
export class OfflineAdmissionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ScannerCryptoService,
  ) {}

  async sync(value: unknown, request: AuthenticatedRequest) {
    const scans = offlineScanCommands(value);
    const results: Ack[] = [];
    // Commit each item independently. An interrupted batch is replayed using the
    // same IDs, and only committed ACKs may remove records on the device.
    for (const scan of scans) results.push(await this.record(scan, request));
    return {
      version: 2,
      results,
      syncedScanIds: results
        .filter((r) => r.status !== 'rejected')
        .map((r) => r.scanId),
      synced: results.filter((r) => r.status === 'synced').length,
      conflicts: results
        .filter((r) => r.status === 'conflict')
        .map((r) => ({ ...r, reason: r.message })),
    };
  }

  private async record(
    scan: OfflineScanCommand,
    request: AuthenticatedRequest,
  ): Promise<Ack> {
    return this.db.$transaction(async (tx) => {
      const sessions = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT u.id FROM sessions s JOIN users u ON u.id=s."userId"
        WHERE s."tokenHash"=${request.sessionHash ?? ''} AND u.id=${request.user.id}::uuid
          AND s."expiresAt">clock_timestamp() AND u."isActive" AND u."isEmailVerified"
          AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur."roleId" WHERE ur."userId"=u.id AND r.name='STAFF')
        FOR SHARE OF s,u`);
      if (!sessions.length)
        throw new UnauthorizedException(
          'Phiên hoặc vai trò soát vé không còn hiệu lực.',
        );
      const [permission] = await tx.$queryRaw<
        { gateName: string; staffName: string }[]
      >(Prisma.sql`
        SELECT g.name AS "gateName",p."staffName" FROM check_in_gates g JOIN check_in_permissions p ON p."gateId"=g.id
        WHERE g.id=${scan.gateId}::uuid AND g."showtimeId"=${scan.showtimeId}::uuid AND p."userId"=${request.user.id}::uuid
        FOR SHARE OF p,g`);
      if (!permission)
        throw new ForbiddenException({
          code: 'SHOWTIME_ACCESS_DENIED',
          message:
            'Bạn không còn quyền tại suất/cửa này. Hàng đợi được giữ lại.',
        });
      const claims = this.crypto.verifyQr(scan.qrPayload);
      if (
        claims.showtimeId !== scan.showtimeId ||
        claims.ticketId !== scan.ticketCode
      )
        throw new BadRequestException({
          code: 'INVALID_SYNC_IDENTITY',
          message: 'QR không khớp với suất hoặc vé trong lượt quét.',
        });
      const payloadHash = offlineScanHash(scan, request.user.id);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'offline-scan:' + scan.scanId},0))`,
      );
      const [prior] = await tx.$queryRaw<
        { payloadHash: string | null; receipt: Ack | null }[]
      >(
        Prisma.sql`SELECT "payloadHash",receipt FROM offline_scan_logs WHERE "scanId"=${scan.scanId}::uuid`,
      );
      if (prior) {
        if (prior.payloadHash !== payloadHash || !prior.receipt)
          throw new ConflictException({
            code: 'SCAN_ID_CONFLICT',
            message:
              'Mã lượt quét đã được dùng cho dữ liệu khác hoặc dữ liệu cũ cần kiểm tra.',
          });
        return prior.receipt;
      }
      const [ticket] = await tx.$queryRaw<
        {
          orderId: string;
          seatId: string;
          checkedInAt: Date | null;
          paid: boolean;
        }[]
      >(Prisma.sql`
        SELECT oi."orderId",oi."seatId",oi."checkedInAt",o.status='PAID' AS paid FROM order_items oi JOIN orders o ON o.id=oi."orderId"
        WHERE oi.id=${scan.ticketCode}::uuid AND o."showtimeId"=${scan.showtimeId}::uuid FOR UPDATE OF oi,o`);
      if (!ticket)
        throw new NotFoundException({
          code: 'UNKNOWN_TICKET',
          message: 'Không tìm thấy vé thuộc suất này.',
        });
      const rows = await tx.$queryRaw<{ status: string }[]>(
        Prisma.sql`SELECT status FROM tickets WHERE "orderId"=${ticket.orderId}::uuid AND "seatId"=${ticket.seatId}::uuid FOR UPDATE`,
      );
      const [clock] = await tx.$queryRaw<{ now: Date }[]>(
        Prisma.sql`SELECT clock_timestamp() AS now`,
      );
      const deviceSentAt = new Date(scan.deviceSentAt),
        scannedAt = new Date(scan.scannedAt);
      const clockOffsetMs = clock.now.getTime() - deviceSentAt.getTime();
      const ack: Ack = {
        scanId: scan.scanId,
        ticketCode: scan.ticketCode,
        status: 'synced',
        code: 'SCAN_RECORDED',
        message:
          'Đã ghi nhận lượt quét. Kết quả xung đột cuối cùng nằm trong báo cáo suất.',
      };
      let status = 'ACCEPTED';
      if (
        !ticket.paid ||
        rows.length !== 1 ||
        rows.some((r) => r.status === 'CANCELLED')
      ) {
        status = 'INVALID';
        ack.status = 'rejected';
        ack.code = 'TICKET_CANCELLED';
        ack.message = 'Vé đã huỷ hoặc không còn đủ điều kiện vào.';
      }
      const [first] = await tx.$queryRaw<Admission[]>(
        Prisma.sql`SELECT id,"requestId","enteredAt","gateId","gateName","staffId" FROM ticket_admissions WHERE "ticketId"=${scan.ticketCode}::uuid AND kind='NORMAL'`,
      );
      const onlineReplay =
        first?.requestId === scan.scanId &&
        first.staffId === request.user.id &&
        first.gateId === scan.gateId &&
        scan.mode === 'online_confirmation';
      let wins =
        !first &&
        !ticket.checkedInAt &&
        !rows.some((r) => r.status === 'CHECKED_IN');
      if (status !== 'INVALID' && first && !onlineReplay) {
        const [firstOffline] = await tx.$queryRaw<
          { scanId: string; scannedAt: Date; mode: string }[]
        >(Prisma.sql`
          SELECT "scanId","scannedAt",mode FROM offline_scan_logs WHERE "scanId"=${first.requestId}::uuid
            AND "staffId"=${first.staffId}::uuid AND status='ACCEPTED'`);
        // S36 compares ORIGINAL device scan times, never corrected or arrival
        // times. Offset is retained for interpretation, not used to change rule.
        wins =
          scan.mode === 'offline_admission' &&
          firstOffline?.mode === 'offline_admission' &&
          (scannedAt.getTime() < firstOffline.scannedAt.getTime() ||
            (scannedAt.getTime() === firstOffline.scannedAt.getTime() &&
              scan.scanId < firstOffline.scanId));
        if (wins)
          await tx.$executeRaw(
            Prisma.sql`UPDATE offline_scan_logs SET status='CONFLICT',message='Lượt ngoại tuyến khác có giờ thiết bị sớm hơn.' WHERE "scanId"=${firstOffline.scanId}::uuid`,
          );
      }
      if (status !== 'INVALID' && !wins && !onlineReplay) {
        status = 'CONFLICT';
        ack.status = 'conflict';
        ack.code = 'TICKET_ALREADY_CHECKED_IN';
        ack.message =
          'Vé đã có lần vào khác; đã lưu xung đột để ban tổ chức đối chiếu.';
      }
      if (onlineReplay) {
        ack.code = 'ALREADY_RECORDED';
        ack.message =
          'Yêu cầu online trước đó đã được ghi nhận. Không tạo lần vào thứ hai.';
      }
      // Store a stable transport receipt separately from mutable S36 ranking.
      // An earlier later-uploaded scan may re-rank a prior accepted scan, but
      // replay does not erase either observation or rewrite its original ACK.
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO offline_scan_logs (id,"scanId","ticketCode","showtimeId","gateId","staffId","deviceId","scannedAt",status,message,"payloadHash",receipt,mode,"deviceSentAt","clockOffsetMs","createdAt")
        VALUES (${randomUUID()}::uuid,${scan.scanId}::uuid,${scan.ticketCode},${scan.showtimeId}::uuid,${scan.gateId}::uuid,${request.user.id}::uuid,
          ${scan.deviceId},${scannedAt},${status},${ack.message},${payloadHash},${JSON.stringify(ack)}::jsonb,${scan.mode},${deviceSentAt},${clockOffsetMs},${clock.now})`);
      if (status === 'ACCEPTED' && wins) {
        const enteredAt =
          scan.mode === 'offline_admission' ? scannedAt : clock.now;
        if (first)
          await tx.$executeRaw(Prisma.sql`
          UPDATE ticket_admissions SET "gateId"=${scan.gateId}::uuid,"gateName"=${permission.gateName},"staffId"=${request.user.id}::uuid,
          "staffName"=${permission.staffName},"requestId"=${scan.scanId}::uuid,"enteredAt"=${enteredAt} WHERE id=${first.id}::uuid`);
        else
          await tx.$executeRaw(Prisma.sql`
          INSERT INTO ticket_admissions (id,"ticketId","showtimeId","gateId","gateName","staffId","staffName","requestId",kind,"enteredAt","ownerConfirmed")
          VALUES (${randomUUID()}::uuid,${scan.ticketCode}::uuid,${scan.showtimeId}::uuid,${scan.gateId}::uuid,${permission.gateName},${request.user.id}::uuid,${permission.staffName},${scan.scanId}::uuid,'NORMAL',${enteredAt},false)`);
        await tx.$executeRaw(
          Prisma.sql`UPDATE order_items SET "checkedInAt"=${enteredAt} WHERE id=${scan.ticketCode}::uuid`,
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE tickets SET status='CHECKED_IN',"checkedInAt"=${enteredAt},"updatedAt"=clock_timestamp() WHERE "orderId"=${ticket.orderId}::uuid AND "seatId"=${ticket.seatId}::uuid`,
        );
      }
      return ack;
    });
  }

  async conflicts(
    showtimeId: string,
    request: AuthenticatedRequest,
    page = { page: 1, pageSize: 50, skip: 0 },
  ) {
    const show = await this.db.showtime.findUnique({
      where: { id: showtimeId },
      select: { event: { select: { organizerId: true } } },
    });
    if (!show) throw new NotFoundException('Không tìm thấy suất.');
    if (
      !request.user.roles.includes('ADMIN') &&
      (!request.user.roles.includes('ORGANIZER') ||
        show.event.organizerId !== request.user.id)
    )
      throw new ForbiddenException('Không có quyền xem báo cáo suất.');
    const rows = await this.db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT loser."scanId",loser."ticketCode",loser."scannedAt",loser."clockOffsetMs",loser."deviceId",loser."createdAt" AS "receivedAt",g.name AS "gateName",
        winner."gateName" AS "winningGate",winner."enteredAt" AS "winningTime",winlog."clockOffsetMs" AS "winningClockOffsetMs"
      FROM offline_scan_logs loser LEFT JOIN check_in_gates g ON g.id=loser."gateId"
      LEFT JOIN ticket_admissions winner ON winner."ticketId"::text=loser."ticketCode" AND winner.kind='NORMAL'
      LEFT JOIN offline_scan_logs winlog ON winlog."scanId"=winner."requestId" AND winlog."staffId"=winner."staffId"
      WHERE loser."showtimeId"=${showtimeId}::uuid AND loser.status='CONFLICT'
      ORDER BY loser."scannedAt",loser."scanId" LIMIT ${page.pageSize} OFFSET ${page.skip}`);
    const [count] = await this.db.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT count(*)::int AS total FROM offline_scan_logs WHERE "showtimeId"=${showtimeId}::uuid AND status='CONFLICT'`,
    );
    return {
      showtimeId,
      conflicts: rows,
      pagination: {
        page: page.page,
        total: count.total,
        hasNext: page.skip + rows.length < count.total,
      },
    };
  }
}
