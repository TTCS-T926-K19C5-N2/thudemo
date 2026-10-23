import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScannerCryptoService } from './scanner-crypto.service.js';
import { TicketStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export interface ScannerTicketItem {
  code: string;
  legacyCodes?: string[];
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
  publicKeys?: {
    keyId: string;
    publicKey: string;
  }[];
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

@Injectable()
export class ScannerService {
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

  async getAttendance(
    showtimeId: string,
    userId: string,
    roles: string[],
  ): Promise<{
    showtimeId: string;
    totalTickets: number;
    checkedInTickets: number;
    generatedAt: string;
  }> {
    await this.verifyStaffAccess(showtimeId, userId, roles);
    const [totalTickets, checkedInTickets] = await Promise.all([
      this.prisma.ticket.count({ where: { showtimeId } }),
      this.prisma.ticket.count({
        where: { showtimeId, status: TicketStatus.CHECKED_IN },
      }),
    ]);
    return {
      showtimeId,
      totalTickets,
      checkedInTickets,
      generatedAt: new Date().toISOString(),
    };
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
        codes.add(item.code);
        tickets.push({
          code: item.code,
          legacyCodes: item.legacyCodes ?? [],
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
      ...(typeof this.crypto.getPublicKeys === 'function'
        ? {
            publicKeys: this.crypto.getPublicKeys().map((k) => ({
              keyId: k.keyId,
              publicKey: k.key,
              key: k.key,
            })),
          }
        : {}),
      tickets,
    };
  }

  async syncOfflineScans(
    scans: {
      scanId: string;
      ticketCode: string;
      showtimeId: string;
      gateId?: string;
      scannedAt: string;
      deviceId: string;
    }[],
    user: { id: string; roles: string[]; [key: string]: unknown },
  ): Promise<
    {
      scanId: string;
      ticketCode: string;
      status: 'synced' | 'conflict' | 'rejected';
      message: string;
    }[]
  > {
    const results: {
      scanId: string;
      ticketCode: string;
      status: 'synced' | 'conflict' | 'rejected';
      message: string;
    }[] = [];

    for (const item of scans) {
      try {
        const existingLog = await this.prisma.offlineScanLog.findUnique({
          where: { scanId: item.scanId },
        });
        if (existingLog) {
          results.push({
            scanId: item.scanId,
            ticketCode: item.ticketCode,
            status:
              existingLog.status === 'ACCEPTED'
                ? 'synced'
                : existingLog.status === 'CONFLICT'
                  ? 'conflict'
                  : 'rejected',
            message: existingLog.message ?? 'Lượt quét đã được xử lý trước đó.',
          });
          continue;
        }

        try {
          await this.verifyStaffAccess(item.showtimeId, user.id, user.roles);
        } catch {
          await this.prisma.offlineScanLog.create({
            data: {
              scanId: item.scanId,
              ticketCode: item.ticketCode,
              showtimeId: item.showtimeId,
              gateId: item.gateId ?? null,
              staffId: user.id,
              deviceId: item.deviceId,
              scannedAt: new Date(item.scannedAt),
              status: 'INVALID',
              message: 'Nhân viên không có quyền soát vé tại suất này.',
            },
          });
          results.push({
            scanId: item.scanId,
            ticketCode: item.ticketCode,
            status: 'rejected',
            message: 'Nhân viên không có quyền soát vé tại suất này.',
          });
          continue;
        }

        const scannedAt = new Date(item.scannedAt);

        const orderItem = await this.prisma.orderItem.findFirst({
          where: {
            id: item.ticketCode,
            order: {
              showtimeId: item.showtimeId,
              status: 'PAID',
            },
          },
          include: {
            order: true,
            seat: true,
          },
        });

        const legacyTicket = !orderItem
          ? await this.prisma.ticket.findFirst({
              where: {
                code: item.ticketCode,
                showtimeId: item.showtimeId,
              },
            })
          : null;

        if (!orderItem && !legacyTicket) {
          await this.prisma.offlineScanLog.create({
            data: {
              scanId: item.scanId,
              ticketCode: item.ticketCode,
              showtimeId: item.showtimeId,
              gateId: item.gateId ?? null,
              staffId: user.id,
              deviceId: item.deviceId,
              scannedAt,
              status: 'INVALID',
              message: 'Mã vé không tồn tại hoặc không thuộc suất diễn này.',
            },
          });
          results.push({
            scanId: item.scanId,
            ticketCode: item.ticketCode,
            status: 'rejected',
            message: 'Mã vé không tồn tại hoặc không thuộc suất diễn này.',
          });
          continue;
        }

        const isCancelled =
          (orderItem && orderItem.order.status !== 'PAID') ||
          (legacyTicket && legacyTicket.status === TicketStatus.CANCELLED);

        if (isCancelled) {
          await this.prisma.offlineScanLog.create({
            data: {
              scanId: item.scanId,
              ticketCode: item.ticketCode,
              showtimeId: item.showtimeId,
              gateId: item.gateId ?? null,
              staffId: user.id,
              deviceId: item.deviceId,
              scannedAt,
              status: 'INVALID',
              message: 'Vé đã bị huỷ.',
            },
          });
          results.push({
            scanId: item.scanId,
            ticketCode: item.ticketCode,
            status: 'rejected',
            message: 'Vé đã bị huỷ.',
          });
          continue;
        }

        const alreadyCheckedInAt =
          orderItem?.checkedInAt ??
          legacyTicket?.checkedInAt ??
          (legacyTicket?.status === TicketStatus.CHECKED_IN ? new Date() : null);

        if (alreadyCheckedInAt) {
          await this.prisma.offlineScanLog.create({
            data: {
              scanId: item.scanId,
              ticketCode: item.ticketCode,
              showtimeId: item.showtimeId,
              gateId: item.gateId ?? null,
              staffId: user.id,
              deviceId: item.deviceId,
              scannedAt,
              status: 'CONFLICT',
              message: `Vé đã được check-in trước đó lúc ${alreadyCheckedInAt.toISOString()}.`,
            },
          });
          results.push({
            scanId: item.scanId,
            ticketCode: item.ticketCode,
            status: 'conflict',
            message: 'Vé đã được check-in trước đó trên thiết bị khác.',
          });
          continue;
        }

        if (orderItem) {
          await this.prisma.orderItem.update({
            where: { id: orderItem.id },
            data: { checkedInAt: scannedAt },
          });
          await this.prisma.ticket.updateMany({
            where: {
              orderId: orderItem.orderId,
              seatId: orderItem.seatId,
            },
            data: {
              status: TicketStatus.CHECKED_IN,
              checkedInAt: scannedAt,
            },
          });
        } else if (legacyTicket) {
          await this.prisma.ticket.update({
            where: { id: legacyTicket.id },
            data: {
              status: TicketStatus.CHECKED_IN,
              checkedInAt: scannedAt,
            },
          });
        }

        await this.prisma.offlineScanLog.create({
          data: {
            scanId: item.scanId,
            ticketCode: item.ticketCode,
            showtimeId: item.showtimeId,
            gateId: item.gateId ?? null,
            staffId: user.id,
            deviceId: item.deviceId,
            scannedAt,
            status: 'ACCEPTED',
            message: 'Đồng bộ lượt quét ngoại tuyến thành công.',
          },
        });

        results.push({
          scanId: item.scanId,
          ticketCode: item.ticketCode,
          status: 'synced',
          message: 'Đồng bộ thành công.',
        });
      } catch (err: unknown) {
        results.push({
          scanId: item.scanId,
          ticketCode: item.ticketCode,
          status: 'rejected',
          message:
            err instanceof Error
              ? err.message
              : 'Lỗi không xác định khi đồng bộ.',
        });
      }
    }

    return results;
  }
}
