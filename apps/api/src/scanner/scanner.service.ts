import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScannerCryptoService } from './scanner-crypto.service.js';
import { TicketStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export interface ScannerTicketItem {
  code: string;
  status: 'valid' | 'checked_in' | 'cancelled';
  checkedInAt: string | null;
  seatLabel: string;
  ticketType: string;
}

export interface ShowtimeTicketsResponse {
  showtimeId: string;
  showtimeName: string;
  generatedAt: string;
  cursor: string;
  publicKey: {
    keyId: string;
    key: string;
  };
  tickets: ScannerTicketItem[];
}

export interface AssignedShowtimeItem {
  id: string;
  name: string;
  eventName: string;
  startTime: string;
  location: string;
  status: string;
  totalTickets: number;
  checkedInTickets: number;
}

export interface OfflineScanItemDto {
  scanId: string;
  ticketCode: string;
  gate: string;
  deviceId?: string;
  scannedAt: string;
}

export interface SyncResultItem {
  scanId: string;
  ticketCode: string;
  status: 'ACCEPTED' | 'DUPLICATE' | 'CONFLICT' | 'NOT_FOUND';
  message?: string;
}

export interface SyncOfflineScansResponse {
  showtimeId: string;
  totalReceived: number;
  acceptedCount: number;
  duplicateCount: number;
  conflictCount: number;
  results: SyncResultItem[];
}

export interface ScanConflictItem {
  id: string;
  showtimeId: string;
  ticketCode: string;
  firstGate: string;
  firstScannedAt: string;
  conflictGate: string;
  conflictScannedAt: string;
  createdAt: string;
}

export interface RealtimeEntryStatsResponse {
  showtimeId: string;
  showtimeName: string;
  startTime: string;
  totalTickets: number;
  checkedInTickets: number;
  remainingTickets: number;
  entryRatePerMinute: number;
  gateStats: Array<{ gate: string; enteredCount: number }>;
  updatedAt: string;
}

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ScannerCryptoService,
  ) {}

  publicKeys() {
    return { keys: this.crypto.getPublicKeys() };
  }

  async getAssignedShowtimes(
    userId: string,
    roles: string[],
  ): Promise<AssignedShowtimeItem[]> {
    const isAdmin = roles.includes('ADMIN');
    const isOrganizer = roles.includes('ORGANIZER');
    const isStaff = roles.includes('STAFF');

    let whereClause: any = {};

    if (isAdmin) {
      whereClause = {};
    } else if (isOrganizer) {
      whereClause = {
        event: { organizerId: userId },
      };
    } else if (isStaff) {
      whereClause = {
        staffAssignments: {
          some: { userId },
        },
      };
    } else {
      return [];
    }

    const showtimes = await this.prisma.showtime.findMany({
      where: whereClause,
      include: {
        event: true,
        _count: {
          select: {
            tickets: true,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    const results: AssignedShowtimeItem[] = [];
    for (const st of showtimes) {
      const checkedInCount = await this.prisma.ticket.count({
        where: {
          showtimeId: st.id,
          status: TicketStatus.CHECKED_IN,
        },
      });

      results.push({
        id: st.id,
        name: `${st.event.name} (${new Date(st.startTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})`,
        eventName: st.event.name,
        startTime: st.startTime.toISOString(),
        location: st.event.location,
        status: st.status,
        totalTickets: st._count.tickets,
        checkedInTickets: checkedInCount,
      });
    }

    return results;
  }

  async verifyStaffAccess(
    showtimeId: string,
    userId: string,
    roles: string[],
  ): Promise<void> {
    if (roles.includes('ADMIN')) {
      return;
    }

    const showtime = await this.prisma.showtime.findUnique({
      where: { id: showtimeId },
      include: { event: true },
    });

    if (!showtime) {
      throw new NotFoundException('Không tìm thấy suất diễn.');
    }

    if (roles.includes('ORGANIZER') && showtime.event.organizerId === userId) {
      return;
    }

    if (roles.includes('STAFF')) {
      const assignment = await this.prisma.showtimeStaff.findUnique({
        where: {
          showtimeId_userId: {
            showtimeId,
            userId,
          },
        },
      });

      if (assignment) {
        return;
      }
    }

    throw new ForbiddenException(
      'Nhân viên chưa được phân công cho suất diễn này.',
    );
  }

  async getShowtimeTickets(
    showtimeId: string,
    since?: string,
    user?: { id: string; roles: string[] },
  ): Promise<ShowtimeTicketsResponse> {
    const showtime = await this.prisma.showtime.findUnique({
      where: { id: showtimeId },
      include: { event: true },
    });

    if (!showtime) {
      throw new NotFoundException('Không tìm thấy suất diễn.');
    }

    if (user) {
      await this.verifyStaffAccess(showtimeId, user.id, user.roles);
    }

    const now = new Date();
    const isIncremental = Boolean(since && since.trim().length > 0);

    let ticketsRaw;
    if (isIncremental) {
      const sinceDate = new Date(since!);
      ticketsRaw = await this.prisma.ticket.findMany({
        where: {
          showtimeId,
          updatedAt: { gt: sinceDate },
        },
        select: {
          code: true,
          status: true,
          checkedInAt: true,
          seatLabel: true,
          ticketType: true,
        },
        orderBy: { updatedAt: 'asc' },
      });
    } else {
      ticketsRaw = await this.prisma.ticket.findMany({
        where: {
          showtimeId,
          status: {
            in: [TicketStatus.VALID, TicketStatus.CHECKED_IN],
          },
        },
        select: {
          code: true,
          status: true,
          checkedInAt: true,
          seatLabel: true,
          ticketType: true,
        },
        orderBy: { code: 'asc' },
      });
    }

    const canonical = await this.prisma.$queryRaw<
      {
        code: string;
        status: string;
        checkedInAt: Date | null;
        seatLabel: string;
        ticketType: string;
        legacyCodes: string[] | null;
      }[]
    >(Prisma.sql`
      SELECT oi.id::text AS code,
        CASE WHEN o.status<>'PAID' OR EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CANCELLED') THEN 'cancelled'
          WHEN oi."checkedInAt" IS NOT NULL OR EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CHECKED_IN') THEN 'checked_in' ELSE 'valid' END AS status,
        COALESCE(oi."checkedInAt",(SELECT min(t."checkedInAt") FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t.status='CHECKED_IN')) AS "checkedInAt",s.row||'-'||s."seatNumber" AS "seatLabel",oi."categoryName" AS "ticketType",
        (SELECT array_agg(t.code) FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId") AS "legacyCodes"
      FROM order_items oi JOIN orders o ON o.id=oi."orderId" JOIN seats s ON s.id=oi."seatId"
      WHERE o."showtimeId"=${showtimeId}::uuid AND s."showtimeId"=o."showtimeId"
        AND (${isIncremental} OR o.status='PAID')
        AND (NOT ${isIncremental} OR o."updatedAt">${isIncremental ? new Date(since!) : new Date(0)} OR oi."checkedInAt">${isIncremental ? new Date(since!) : new Date(0)}
          OR EXISTS(SELECT 1 FROM tickets t WHERE t."orderId"=o.id AND t."seatId"=oi."seatId" AND t."updatedAt">${isIncremental ? new Date(since!) : new Date(0)}))`);
    const coveredCodes = new Set(
      canonical.flatMap((item) => item.legacyCodes ?? []),
    );
    const tickets: ScannerTicketItem[] = ticketsRaw
      .filter((ticket) => !coveredCodes.has(ticket.code))
      .map((t) => ({
        code: t.code,
        status:
          t.status === TicketStatus.CHECKED_IN
            ? 'checked_in'
            : t.status === TicketStatus.CANCELLED
              ? 'cancelled'
              : 'valid',
        checkedInAt: t.checkedInAt ? t.checkedInAt.toISOString() : null,
        seatLabel: t.seatLabel,
        ticketType: t.ticketType,
      }));

    const codes = new Set(tickets.map((ticket) => ticket.code));
    for (const item of canonical) {
      if (
        !codes.has(item.code) &&
        (isIncremental || item.status !== 'cancelled')
      ) {
        tickets.push({
          code: item.code,
          seatLabel: item.seatLabel,
          ticketType: item.ticketType,
          status: item.status as ScannerTicketItem['status'],
          checkedInAt: item.checkedInAt?.toISOString() ?? null,
        });
      }
    }
    return {
      showtimeId: showtime.id,
      showtimeName: showtime.event.name,
      generatedAt: now.toISOString(),
      cursor: now.toISOString(),
      publicKey: this.crypto.getPublicKeyInfo(),
      tickets,
    };
  }

  async assignStaffToShowtime(
    showtimeId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.showtimeStaff.upsert({
      where: {
        showtimeId_userId: { showtimeId, userId },
      },
      update: {},
      create: { showtimeId, userId },
    });
  }

  async createTicketsForPaidOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            seat: true,
          },
        },
      },
    });

    if (!order) return;

    for (const item of order.items) {
      const existing = await this.prisma.ticket.findFirst({
        where: {
          orderId: order.id,
          seatId: item.seatId,
        },
      });

      if (!existing) {
        const code = `TK-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
        const seatLabel = item.seat
          ? `${item.seat.row}-${item.seat.seatNumber}`
          : item.categoryName;

        await this.prisma.ticket.create({
          data: {
            orderId: order.id,
            showtimeId: order.showtimeId,
            seatId: item.seatId,
            code,
            seatLabel,
            ticketType: item.categoryName,
            status: TicketStatus.VALID,
            price: item.unitPrice,
          },
        });
      }
    }
  }

  /**
   * S-35: Đồng bộ các lần quét ngoại tuyến lên máy chủ khi có mạng lại
   * S-36: Xung đột soát vé ở hai cửa được phát hiện khi đồng bộ
   */
  async syncOfflineScans(
    showtimeId: string,
    scans: OfflineScanItemDto[],
    user: { id: string; roles: string[] },
  ): Promise<SyncOfflineScansResponse> {
    await this.verifyStaffAccess(showtimeId, user.id, user.roles);

    const results: SyncResultItem[] = [];
    let acceptedCount = 0;
    let duplicateCount = 0;
    let conflictCount = 0;

    // Sắp xếp các scan theo thời gian quét tăng dần để xử lý đúng trình tự
    const sortedScans = [...scans].sort(
      (a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime(),
    );

    for (const scan of sortedScans) {
      // 1. Kiểm tra idempotent: mã scanId duy nhất sinh trên thiết bị
      const existingLog = await this.prisma.offlineScanLog.findUnique({
        where: { scanId: scan.scanId },
      });

      if (existingLog) {
        duplicateCount++;
        results.push({
          scanId: scan.scanId,
          ticketCode: scan.ticketCode,
          status: 'DUPLICATE',
          message: 'Lần quét đã được đồng bộ trước đó',
        });
        continue;
      }

      // 2. Tìm vé trong suất diễn
      const ticket = await this.prisma.ticket.findFirst({
        where: {
          showtimeId,
          code: scan.ticketCode,
        },
      });

      if (!ticket) {
        await this.prisma.offlineScanLog.create({
          data: {
            scanId: scan.scanId,
            showtimeId,
            ticketCode: scan.ticketCode,
            gate: scan.gate,
            deviceId: scan.deviceId,
            scannedAt: new Date(scan.scannedAt),
            status: 'NOT_FOUND',
          },
        });
        results.push({
          scanId: scan.scanId,
          ticketCode: scan.ticketCode,
          status: 'NOT_FOUND',
          message: 'Vé không tồn tại trong suất diễn',
        });
        continue;
      }

      const scanTime = new Date(scan.scannedAt);

      // 3. Nếu vé hợp lệ và chưa vào: chấp nhận check-in
      if (ticket.status === TicketStatus.VALID) {
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            status: TicketStatus.CHECKED_IN,
            checkedInAt: scanTime,
            gate: scan.gate,
          },
        });

        await this.prisma.offlineScanLog.create({
          data: {
            scanId: scan.scanId,
            showtimeId,
            ticketCode: scan.ticketCode,
            gate: scan.gate,
            deviceId: scan.deviceId,
            scannedAt: scanTime,
            status: 'ACCEPTED',
          },
        });

        acceptedCount++;
        results.push({
          scanId: scan.scanId,
          ticketCode: scan.ticketCode,
          status: 'ACCEPTED',
        });
        continue;
      }

      // 4. Nếu vé ĐÃ CHECKED_IN trước đó (S-36: xử lý xung đột 2 cửa)
      if (ticket.status === TicketStatus.CHECKED_IN) {
        conflictCount++;
        const currentCheckedInAt = ticket.checkedInAt ?? scanTime;
        const currentGate = ticket.gate ?? 'Cửa trước';

        // S-36 AC1: Lần quét sớm hơn theo giờ thiết bị được tính là lần vào, lần kia thành xung đột
        if (scanTime.getTime() < currentCheckedInAt.getTime()) {
          // Lần quét này xảy ra sớm hơn -> cập nhật vé theo lần quét này
          await this.prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              checkedInAt: scanTime,
              gate: scan.gate,
            },
          });

          // Ghi nhận lần quét trước kia thành xung đột
          await this.prisma.scanConflict.create({
            data: {
              showtimeId,
              ticketCode: ticket.code,
              firstGate: scan.gate,
              firstScannedAt: scanTime,
              conflictGate: currentGate,
              conflictScannedAt: currentCheckedInAt,
            },
          });
        } else {
          // Lần quét này muộn hơn -> lần quét này thành xung đột, không ghi đè
          await this.prisma.scanConflict.create({
            data: {
              showtimeId,
              ticketCode: ticket.code,
              firstGate: currentGate,
              firstScannedAt: currentCheckedInAt,
              conflictGate: scan.gate,
              conflictScannedAt: scanTime,
            },
          });
        }

        await this.prisma.offlineScanLog.create({
          data: {
            scanId: scan.scanId,
            showtimeId,
            ticketCode: scan.ticketCode,
            gate: scan.gate,
            deviceId: scan.deviceId,
            scannedAt: scanTime,
            status: 'CONFLICT',
          },
        });

        results.push({
          scanId: scan.scanId,
          ticketCode: scan.ticketCode,
          status: 'CONFLICT',
          message: 'Vé đã được quét trước đó ở cửa khác',
        });
        continue;
      }

      // Nếu vé đã bị huỷ
      results.push({
        scanId: scan.scanId,
        ticketCode: scan.ticketCode,
        status: 'CONFLICT',
        message: 'Vé đã bị huỷ',
      });
    }

    return {
      showtimeId,
      totalReceived: scans.length,
      acceptedCount,
      duplicateCount,
      conflictCount,
      results,
    };
  }

  /**
   * S-36 AC2: Ban tổ chức mở báo cáo suất thấy danh sách vé xung đột, hai cửa, hai thời điểm
   */
  async getShowtimeConflicts(
    showtimeId: string,
    user: { id: string; roles: string[] },
  ): Promise<ScanConflictItem[]> {
    await this.verifyStaffAccess(showtimeId, user.id, user.roles);

    const conflicts = await this.prisma.scanConflict.findMany({
      where: { showtimeId },
      orderBy: { createdAt: 'desc' },
    });

    return conflicts.map((c) => ({
      id: c.id,
      showtimeId: c.showtimeId,
      ticketCode: c.ticketCode,
      firstGate: c.firstGate,
      firstScannedAt: c.firstScannedAt.toISOString(),
      conflictGate: c.conflictGate,
      conflictScannedAt: c.conflictScannedAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /**
   * S-52: Ban tổ chức xem số khách đã vào cửa theo thời gian thực
   */
  async getRealtimeEntryStats(
    showtimeId: string,
    user: { id: string; roles: string[] },
  ): Promise<RealtimeEntryStatsResponse> {
    await this.verifyStaffAccess(showtimeId, user.id, user.roles);

    const showtime = await this.prisma.showtime.findUnique({
      where: { id: showtimeId },
      include: { event: true },
    });

    if (!showtime) {
      throw new NotFoundException('Không tìm thấy suất diễn.');
    }

    const totalTickets = await this.prisma.ticket.count({
      where: { showtimeId },
    });

    const checkedInTickets = await this.prisma.ticket.count({
      where: {
        showtimeId,
        status: TicketStatus.CHECKED_IN,
      },
    });

    const remainingTickets = Math.max(0, totalTickets - checkedInTickets);

    // Thống kê theo từng cửa
    const gateGroups = await this.prisma.ticket.groupBy({
      by: ['gate'],
      where: {
        showtimeId,
        status: TicketStatus.CHECKED_IN,
      },
      _count: { id: true },
    });

    const gateStats = gateGroups.map((g) => ({
      gate: g.gate || 'Chưa phân cửa',
      enteredCount: g._count.id,
    }));

    // Tốc độ vào theo phút: tính số vé checked-in trong 1 phút gần nhất
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentEntryCount = await this.prisma.ticket.count({
      where: {
        showtimeId,
        status: TicketStatus.CHECKED_IN,
        checkedInAt: { gte: oneMinuteAgo },
      },
    });

    return {
      showtimeId,
      showtimeName: showtime.event.name,
      startTime: showtime.startTime.toISOString(),
      totalTickets,
      checkedInTickets,
      remainingTickets,
      entryRatePerMinute: recentEntryCount,
      gateStats,
      updatedAt: new Date().toISOString(),
    };
  }
}
