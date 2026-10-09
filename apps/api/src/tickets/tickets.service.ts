import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, TicketStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateTicketCode } from './ticket-code.js';
import { encodeTicketQr } from './ticket-qr.js';
import { TicketSigningService } from './ticket-signing.service.js';

export interface PaidOrderForIssue {
  id: string;
  showtimeId: string;
  items: {
    seatId: string;
    categoryName: string;
    unitPrice: number;
    seat: { row: string; seatNumber: number } | null;
  }[];
}

export interface OrderTicketItem {
  id: string;
  code: string;
  seatId: string | null;
  seatLabel: string;
  ticketType: string;
  status: TicketStatus;
  // Null only for tickets created before S-26 without a signature.
  qrPayload: string | null;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly db: PrismaService,
    private readonly signing: TicketSigningService,
  ) {}

  // Runs inside the transaction that moves the order to PAID, so tickets
  // exist exactly when the order is paid. The unique (orderId, seatId) index
  // plus skipDuplicates keeps a replayed webhook from issuing twice.
  async issueForPaidOrder(
    tx: Prisma.TransactionClient,
    order: PaidOrderForIssue,
  ): Promise<void> {
    if (order.items.length === 0) return;
    await tx.ticket.createMany({
      data: order.items.map((item) => {
        const code = generateTicketCode();
        const { keyId, signature } = this.signing.sign({
          code,
          showtimeId: order.showtimeId,
        });
        return {
          orderId: order.id,
          showtimeId: order.showtimeId,
          seatId: item.seatId,
          code,
          seatLabel: item.seat
            ? `${item.seat.row}-${item.seat.seatNumber}`
            : item.categoryName,
          ticketType: item.categoryName,
          status: TicketStatus.VALID,
          price: item.unitPrice,
          keyId,
          signature,
        };
      }),
      skipDuplicates: true,
    });
  }

  async listForOrder(orderId: string, userId: string): Promise<OrderTicketItem[]> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      select: { userId: true, status: true, showtimeId: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    if (order.status !== OrderStatus.PAID) return [];

    const tickets = await this.db.ticket.findMany({
      where: { orderId },
      orderBy: { seatLabel: 'asc' },
    });
    return tickets.map((ticket) => ({
      id: ticket.id,
      code: ticket.code,
      seatId: ticket.seatId,
      seatLabel: ticket.seatLabel,
      ticketType: ticket.ticketType,
      status: ticket.status,
      qrPayload:
        ticket.keyId && ticket.signature
          ? encodeTicketQr({
              keyId: ticket.keyId,
              code: ticket.code,
              showtimeId: ticket.showtimeId,
              signature: ticket.signature,
            })
          : null,
    }));
  }

  async transferTicket(
    orderId: string,
    ticketId: string,
    userId: string,
    toEmail: string,
  ): Promise<void> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    const ticket = await this.db.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket || ticket.orderId !== orderId) {
      throw new NotFoundException('Không tìm thấy vé.');
    }
    if (ticket.status !== TicketStatus.VALID) {
      throw new BadRequestException('Chỉ có thể chuyển nhượng vé hợp lệ.');
    }

    await this.db.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.CANCELLED,
          transferredToEmail: toEmail,
        },
      });

      const code = generateTicketCode();
      const { keyId, signature } = this.signing.sign({
        code,
        showtimeId: ticket.showtimeId,
      });

      const newTicket = await tx.ticket.create({
        data: {
          showtimeId: ticket.showtimeId,
          seatId: ticket.seatId,
          code,
          seatLabel: ticket.seatLabel,
          ticketType: ticket.ticketType,
          status: TicketStatus.VALID,
          price: ticket.price,
          keyId,
          signature,
          ownerEmail: toEmail,
        },
      });

      await tx.ticketLog.create({
        data: {
          ticketId: ticket.id,
          action: 'TRANSFERRED',
          actorId: userId,
          detail: { toEmail, newTicketId: newTicket.id },
        },
      });
      await tx.ticketLog.create({
        data: {
          ticketId: newTicket.id,
          action: 'ISSUED_FROM_TRANSFER',
          actorId: userId,
          detail: { fromTicketId: ticket.id },
        },
      });
    });
  }
}
