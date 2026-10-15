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
  transferredToEmail?: string | null;
  ownerEmail?: string | null;
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
      transferredToEmail: ticket.transferredToEmail,
      ownerEmail: ticket.ownerEmail,
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
    const normalizedEmail = (toEmail ?? '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      throw new BadRequestException('Email người nhận không hợp lệ.');
    }

    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user?.email && user.email.toLowerCase() === normalizedEmail) {
      throw new BadRequestException('Không thể chuyển nhượng vé cho chính mình.');
    }

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
    if (ticket.ownerEmail && ticket.ownerEmail.toLowerCase() === normalizedEmail) {
      throw new BadRequestException('Vé đã thuộc về người nhận này.');
    }

    await this.db.$transaction(async (tx) => {
      // Atomic status update: if concurrent requests try to transfer the same ticket,
      // only one matches status: VALID and gets count === 1.
      const updated = await tx.ticket.updateMany({
        where: {
          id: ticketId,
          status: TicketStatus.VALID,
        },
        data: {
          status: TicketStatus.CANCELLED,
          cancelledAt: new Date(),
          transferredToEmail: normalizedEmail,
        },
      });

      if (updated.count === 0) {
        throw new BadRequestException('Vé đã bị huỷ hoặc chuyển nhượng trước đó.');
      }

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
          ownerEmail: normalizedEmail,
        },
      });

      await tx.ticketLog.create({
        data: {
          ticketId: ticket.id,
          action: 'TRANSFERRED',
          actorId: userId,
          detail: { toEmail: normalizedEmail, newTicketId: newTicket.id },
        },
      });
      await tx.ticketLog.create({
        data: {
          ticketId: newTicket.id,
          action: 'ISSUED_FROM_TRANSFER',
          actorId: userId,
          detail: { fromTicketId: ticket.id, fromOwner: user?.email },
        },
      });
    });
  }
}
