import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  TicketSigningService,
  type TicketPublicKeyInfo,
} from '../tickets/ticket-signing.service.js';
import { TicketStatus } from '@prisma/client';

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
  // Every key a QR may be signed with (active + retired), so the scanner can
  // verify offline by the keyId in the QR.
  publicKeys: TicketPublicKeyInfo[];
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
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: TicketSigningService,
  ) {}

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

    const tickets: ScannerTicketItem[] = ticketsRaw.map((t) => ({
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

    return {
      showtimeId: showtime.id,
      showtimeName: showtime.event.name,
      generatedAt: now.toISOString(),
      cursor: now.toISOString(),
      publicKeys: this.signing.getPublicKeys(),
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
}
