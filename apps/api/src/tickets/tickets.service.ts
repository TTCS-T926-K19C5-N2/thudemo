import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TicketStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateTicketCode } from './ticket-code.js';
import { TicketQrService } from '../orders/ticket-qr.service.js';
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
    private readonly projection: TicketQrService,
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
    // Durable work commits with PAID and its existing minimal tickets. Workers
    // cannot observe it before commit; webhook replay cannot enqueue twice.
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ticket_mail_deliveries(id,"orderId","dedupeKey")
      VALUES(${randomUUID()}::uuid,${order.id}::uuid,${'paid:' + order.id})
      ON CONFLICT ("dedupeKey") DO NOTHING`);
  }

  async listForOrder(
    orderId: string,
    userId: string,
  ): Promise<OrderTicketItem[]> {
    return (await this.projection.forOwner(orderId, userId)).tickets;
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
      throw new BadRequestException(
        'Không thể chuyển nhượng vé cho chính mình.',
      );
    }

    const order = await this.db.order.findUnique({
      where: { id: orderId },
      select: { userId: true, status: true },
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    const ticket = await this.db.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket || ticket.orderId !== orderId) {
      throw new NotFoundException('Không tìm thấy vé.');
    }
    const owns = ticket.ownerEmail
      ? ticket.ownerEmail.toLowerCase() === user?.email.toLowerCase()
      : order.userId === userId;
    if (!owns)
      throw new NotFoundException('Không tìm thấy vé thuộc tài khoản.');
    if (ticket.status !== TicketStatus.VALID) {
      throw new BadRequestException('Chỉ có thể chuyển nhượng vé hợp lệ.');
    }
    if (
      ticket.ownerEmail &&
      ticket.ownerEmail.toLowerCase() === normalizedEmail
    ) {
      throw new BadRequestException('Vé đã thuộc về người nhận này.');
    }

    await this.db.$transaction(async (tx) => {
      // Use the same order/item/ticket locks as admission and cancellation.
      // Financial ownership stays on the original order. Only an unused
      // admission identity is rotated; existing admissions are never rewritten.
      const [identity] = await tx.$queryRaw<
        {
          id: string;
          checkedInAt: Date | null;
          admitted: boolean;
          paid: boolean;
        }[]
      >(Prisma.sql`
        SELECT oi.id,oi."checkedInAt",o.status='PAID' AS paid,
          EXISTS(SELECT 1 FROM ticket_admissions a WHERE a."ticketId"=oi.id) AS admitted
        FROM orders o JOIN order_items oi ON oi."orderId"=o.id
          JOIN tickets t ON t."orderId"=o.id AND t."seatId"=oi."seatId"
        WHERE o.id=${orderId}::uuid AND t.id=${ticketId}::uuid
        FOR UPDATE OF o,oi,t`);
      if (
        !identity ||
        !identity.paid ||
        identity.checkedInAt ||
        identity.admitted
      )
        throw new BadRequestException(
          'Vé đã sử dụng, bị thay thế hoặc đơn không còn được chuyển nhượng.',
        );
      // Atomic status update: if concurrent requests try to transfer the same ticket,
      // only one matches status: VALID and gets count === 1.
      const updated = await tx.ticket.updateMany({
        where: {
          id: ticketId,
          status: TicketStatus.VALID,
          checkedInAt: null,
          orderId,
        },
        data: {
          status: TicketStatus.CANCELLED,
          cancelledAt: new Date(),
          transferredToEmail: normalizedEmail,
          // Free the current (order,seat) projection slot while retaining the
          // revoked ticket row and its history. The original QR ID is audited.
          orderId: null,
        },
      });

      if (updated.count === 0) {
        throw new BadRequestException(
          'Vé đã bị huỷ hoặc chuyển nhượng trước đó.',
        );
      }

      const code = generateTicketCode();
      const replacementQrId = randomUUID();
      await tx.orderItem.update({
        where: { id: identity.id },
        data: { id: replacementQrId },
      });
      const { keyId, signature } = this.signing.sign({
        code,
        showtimeId: ticket.showtimeId,
      });

      const newTicket = await tx.ticket.create({
        data: {
          orderId,
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
          detail: {
            toEmail: normalizedEmail,
            newTicketId: newTicket.id,
            orderId,
            revokedQrId: identity.id,
            replacementQrId,
          },
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
