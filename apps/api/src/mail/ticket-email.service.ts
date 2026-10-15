import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService, type OrderTicketItem } from '../tickets/tickets.service.js';
import { MailService, type MailAttachment, type MailSendResult } from './mail.service.js';

export interface TicketEmailResult {
  sent: boolean;
  attempts: number;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Builds and sends the ticket email for an order. It never issues tickets:
// it only reads the tickets that the PAID transition already created, and it
// reuses their stored QR payload (signed once at issue time).
@Injectable()
export class TicketEmailService {
  private readonly logger = new Logger(TicketEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly mail: MailService,
  ) {}

  // Owner-checked entry point used by the buyer's "resend" action.
  async sendTicketsForOrder(
    orderId: string,
    userId: string,
  ): Promise<TicketEmailResult> {
    return this.deliver(orderId, userId);
  }

  // Automatic delivery after PAID. Runs without a request user; the recipient is
  // still the order owner's account email, so no ownership bypass happens here.
  async sendTicketsForPaidOrderSystem(orderId: string): Promise<TicketEmailResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order) return { sent: false, attempts: 0, error: 'Không tìm thấy đơn hàng.' };
    return this.deliver(orderId, order.userId);
  }

  private async deliver(
    orderId: string,
    userId: string,
  ): Promise<TicketEmailResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        totalAmount: true,
        showtime: {
          select: {
            startTime: true,
            event: { select: { name: true, location: true } },
          },
        },
        user: { select: { email: true } },
      },
    });
    if (!order || order.userId !== userId) {
      return { sent: false, attempts: 0, error: 'Không tìm thấy đơn hàng.' };
    }
    if (order.status !== 'PAID') {
      throw new BadRequestException({
        code: 'TICKETS_NOT_READY',
        message: 'Vé chỉ được gửi sau khi thanh toán được xác nhận.',
      });
    }

    const recipient = order.user.email;
    if (!EMAIL_RE.test(recipient)) {
      return { sent: false, attempts: 0, error: 'Email tài khoản không hợp lệ.' };
    }

    // listForOrder returns only the tickets this order owns and their stored
    // QR payloads. Cancelled (transferred-away) tickets have no QR and are skipped.
    const tickets = await this.tickets.listForOrder(orderId, userId);
    const active = tickets.filter(
      (t): t is OrderTicketItem & { qrPayload: string } =>
        t.status !== 'CANCELLED' && t.qrPayload !== null,
    );
    if (active.length === 0) {
      return { sent: false, attempts: 0, error: 'Đơn hàng chưa có vé để gửi.' };
    }

    const attachments: MailAttachment[] = [];
    for (const ticket of active) {
      const png = await QRCode.toBuffer(ticket.qrPayload, {
        width: 250,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      attachments.push({
        filename: `ve-${ticket.code}.png`,
        content: png,
        cid: `qr-${ticket.id}`,
      });
    }

    const eventName = order.showtime.event.name;
    const shortOrder = order.id.slice(0, 8).toUpperCase();
    const when = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(order.showtime.startTime);

    const rows = active
      .map(
        (t) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${escapeHtml(t.code)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(t.seatLabel)} (${escapeHtml(t.ticketType)})</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">
            <img src="cid:qr-${t.id}" alt="Mã QR vé ${escapeHtml(t.code)}" width="140" height="140" />
          </td>
        </tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>Vé điện tử</title></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;">
  <h2>Vé điện tử - ${escapeHtml(eventName)}</h2>
  <p>Đơn hàng #${shortOrder} | Suất: ${escapeHtml(when)} | Địa điểm: ${escapeHtml(order.showtime.event.location)}</p>
  <table style="border-collapse:collapse;width:100%;max-width:640px;">
    <thead><tr>
      <th style="text-align:left;padding:8px;">Mã vé</th>
      <th style="text-align:left;padding:8px;">Ghế</th>
      <th style="padding:8px;">QR</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:13px;color:#475569;">Mỗi mã QR chỉ có giá trị vào cửa một lần. Vui lòng không chia sẻ mã QR cho người khác.</p>
</body></html>`;

    const text =
      `Vé điện tử - ${eventName}\n` +
      `Đơn hàng #${shortOrder}\n` +
      `Suất: ${when}\n` +
      `Địa điểm: ${order.showtime.event.location}\n\n` +
      active
        .map((t) => `- Mã vé ${t.code} | Ghế ${t.seatLabel} (${t.ticketType})`)
        .join('\n') +
      `\n\nMở email dạng HTML để xem mã QR vào cửa.`;

    const result: MailSendResult = await this.mail.send({
      orderId,
      to: recipient,
      subject: `[Vé điện tử] ${eventName} - Đơn hàng #${shortOrder}`,
      text,
      html,
      attachments,
    });

    if (result.success) {
      this.logger.log(
        JSON.stringify({ event: 'ticket_email_sent', orderId, attempts: result.attempts }),
      );
      return { sent: true, attempts: result.attempts };
    }
    return { sent: false, attempts: result.attempts, error: result.error };
  }
}
