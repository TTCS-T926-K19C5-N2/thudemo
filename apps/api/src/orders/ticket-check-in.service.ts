import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckedInRow = { checkedInAt: Date };

@Injectable()
export class TicketCheckInService {
  constructor(private readonly db: PrismaService) {}

  async checkIn(
    showtimeId: string,
    ticketId: unknown,
    userId: string,
    roles: string[],
  ) {
    if (typeof ticketId !== 'string' || !uuidPattern.test(ticketId)) {
      throw new BadRequestException({
        code: 'INVALID_TICKET',
        message: 'Mã QR không hợp lệ.',
      });
    }

    const ticket = await this.db.orderItem.findUnique({
      where: { id: ticketId },
      select: {
        checkedInAt: true,
        categoryName: true,
        tierName: true,
        order: {
          select: {
            status: true,
            showtimeId: true,
            showtime: {
              select: {
                event: { select: { organizerId: true } },
              },
            },
          },
        },
        seat: {
          select: {
            showtimeId: true,
            row: true,
            seatNumber: true,
          },
        },
      },
    });

    if (
      !ticket ||
      ticket.order.status !== 'PAID' ||
      ticket.order.showtimeId !== showtimeId ||
      ticket.seat.showtimeId !== showtimeId
    ) {
      throw new NotFoundException({
        code: 'INVALID_TICKET',
        message: 'Vé không hợp lệ hoặc không thuộc suất diễn này.',
      });
    }

    const canCheckAnyShowtime =
      roles.includes('STAFF') || roles.includes('ADMIN');
    if (
      !canCheckAnyShowtime &&
      ticket.order.showtime.event.organizerId !== userId
    ) {
      throw new ForbiddenException({
        code: 'SHOWTIME_ACCESS_DENIED',
        message: 'Bạn không có quyền soát vé cho suất diễn này.',
      });
    }

    if (ticket.checkedInAt) {
      throw this.alreadyCheckedIn();
    }

    const updated = await this.db.$queryRaw<CheckedInRow[]>(Prisma.sql`
      UPDATE order_items
      SET "checkedInAt" = clock_timestamp()
      WHERE id = ${ticketId}::uuid
        AND "checkedInAt" IS NULL
        AND EXISTS (
          SELECT 1
          FROM orders
          WHERE orders.id = order_items."orderId"
            AND orders."showtimeId" = ${showtimeId}::uuid
            AND orders.status = 'PAID'::"OrderStatus"
        )
        AND EXISTS (
          SELECT 1
          FROM seats
          WHERE seats.id = order_items."seatId"
            AND seats."showtimeId" = ${showtimeId}::uuid
        )
        AND EXISTS (
          SELECT 1
          FROM showtimes
          JOIN events ON events.id = showtimes."eventId"
          WHERE showtimes.id = ${showtimeId}::uuid
            AND (
              ${roles.includes('STAFF') || roles.includes('ADMIN')}
              OR events."organizerId" = ${userId}::uuid
            )
        )
      RETURNING "checkedInAt"
    `);

    if (!updated.length) {
      const current = await this.db.orderItem.findUnique({
        where: { id: ticketId },
        select: { checkedInAt: true },
      });
      if (current?.checkedInAt) throw this.alreadyCheckedIn();
      throw new NotFoundException({
        code: 'INVALID_TICKET',
        message: 'Vé không hợp lệ hoặc không thuộc suất diễn này.',
      });
    }

    return {
      status: 'SUCCESS' as const,
      ticketId,
      seat: {
        category: ticket.categoryName || ticket.tierName || '',
        row: ticket.seat.row,
        number: ticket.seat.seatNumber,
        label: `${ticket.seat.row}-${ticket.seat.seatNumber}`,
      },
      checkedInAt: updated[0].checkedInAt.toISOString(),
    };
  }

  private alreadyCheckedIn() {
    return new ConflictException({
      code: 'TICKET_ALREADY_CHECKED_IN',
      message: 'Vé này đã được check-in trước đó.',
    });
  }
}
