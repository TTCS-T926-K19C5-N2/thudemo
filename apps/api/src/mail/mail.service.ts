import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter, type SendMailOptions } from 'nodemailer';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';

export type TicketEmailData = {
  id: string;
  ticketCode: string;
  seatRow: string;
  seatNumber: number;
  categoryName: string;
  price: number;
  qrCodeData: string;
  qrCodeImage?: string | null;
};

export type OrderEmailData = {
  id: string;
  customerEmail: string;
  totalAmount: number;
  eventName: string;
  showtimeDate: Date;
  location: string;
  tickets: TicketEmailData[];
};

export type SendEmailResult = {
  success: boolean;
  attempts: number;
  error?: string;
  sentAt?: Date;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    if (smtpHost) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(this.config.get<string>('SMTP_PORT')) || 587,
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: this.config.get<string>('SMTP_USER')
          ? {
              user: this.config.get<string>('SMTP_USER')!,
              pass: this.config.get<string>('SMTP_PASS')!,
            }
          : undefined,
      });
      this.logger.log(`MailService configured with SMTP host: ${smtpHost}`);
    } else {
      // In local development without external SMTP server, use jsonTransport
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      this.logger.log('MailService configured with local jsonTransport.');
    }
  }

  async generateQrCode(payload: string): Promise<{ dataUrl: string; buffer: Buffer }> {
    const dataUrl = await QRCode.toDataURL(payload, {
      width: 250,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
    const buffer = await QRCode.toBuffer(payload, {
      width: 250,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    return { dataUrl, buffer };
  }

  private formatVnd(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  }

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(date));
  }

  private buildEmailHtml(order: OrderEmailData): string {
    const formattedDate = this.formatDateTime(order.showtimeDate);
    const formattedTotal = this.formatVnd(order.totalAmount);

    const ticketCards = order.tickets
      .map(
        (t) => `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; background-color: #ffffff;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <div style="font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Mã vé</div>
              <div style="font-size: 18px; font-weight: bold; color: #0f172a; font-family: monospace;">${t.ticketCode}</div>
              <div style="margin-top: 6px; font-size: 15px; color: #1e293b;">
                <strong>Hàng ghế ${t.seatRow} - Ghế số ${t.seatNumber}</strong> (${t.categoryName})
              </div>
              <div style="font-size: 14px; color: #0284c7; font-weight: 600; margin-top: 4px;">
                Giá vé: ${this.formatVnd(t.price)}
              </div>
            </div>
            <div style="text-align: center; margin-left: 16px;">
              <img src="cid:qr-${t.id}" alt="Mã QR vé ${t.ticketCode}" style="width: 140px; height: 140px; display: block; border-radius: 4px; border: 1px solid #cbd5e1;" />
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Quét tại cổng</div>
            </div>
          </div>
        </div>
      `,
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="utf-8">
        <title>Vé điện tử - ${order.eventName}</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; line-height: 1.5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background-color: #175cd3; color: #ffffff; padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">Xác nhận vé điện tử</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 15px;">Đơn hàng #${order.id.slice(0, 8).toUpperCase()}</p>
          </div>
          
          <div style="padding: 24px;">
            <p style="font-size: 16px; margin-top: 0;">Xin chào <strong>${order.customerEmail}</strong>,</p>
            <p style="font-size: 15px; color: #475569;">Cảm ơn bạn đã mua vé thành công. Dưới đây là thông tin vé và mã QR của bạn để xuất trình khi vào cửa (kể cả khi không đăng nhập).</p>
            
            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #0f172a;">${order.eventName}</h2>
              <div style="font-size: 14px; color: #475569; margin-bottom: 6px;">
                📅 <strong>Thời gian:</strong> ${formattedDate}
              </div>
              <div style="font-size: 14px; color: #475569; margin-bottom: 6px;">
                📍 <strong>Địa điểm:</strong> ${order.location}
              </div>
              <div style="font-size: 14px; color: #475569;">
                💰 <strong>Tổng thanh toán:</strong> <span style="font-size: 16px; font-weight: bold; color: #16a34a;">${formattedTotal}</span>
              </div>
            </div>

            <h3 style="font-size: 16px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 24px; margin-bottom: 16px;">
              Danh sách vé (${order.tickets.length} vé)
            </h3>
            
            ${ticketCards}

            <div style="margin-top: 24px; padding: 16px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6; font-size: 13px; color: #1e40af;">
              <strong>Lưu ý quan trọng:</strong>
              <ul style="margin: 6px 0 0 0; padding-left: 20px;">
                <li>Vui lòng giữ mã QR cẩn thận và không chia sẻ cho người khác.</li>
                <li>Mỗi mã QR chỉ có giá trị quét check-in một lần duy nhất tại cửa sự kiện.</li>
                <li>Bạn có thể chụp màn hình hoặc lưu email này về điện thoại để quét trực tiếp tại cổng soát vé.</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            Hệ thống bán vé sự kiện &copy; 2026. Mọi thắc mắc xin vui lòng liên hệ ban tổ chức.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendTicketEmail(
    order: OrderEmailData,
    recipientEmail: string,
  ): Promise<SendEmailResult> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    // Generate QR buffers for inline CID attachments
    const attachments: SendMailOptions['attachments'] = [];
    for (const ticket of order.tickets) {
      const { buffer } = await this.generateQrCode(ticket.qrCodeData);
      attachments.push({
        filename: `qr-${ticket.ticketCode}.png`,
        content: buffer,
        cid: `qr-${ticket.id}`,
      });
    }

    const html = this.buildEmailHtml(order);
    const subject = `[Vé điện tử] ${order.eventName} - Đơn hàng #${order.id.slice(0, 8).toUpperCase()}`;
    const text = `Xác nhận vé điện tử - ${order.eventName}\n` +
      `Đơn hàng #${order.id.slice(0, 8).toUpperCase()}\n` +
      `Thời gian: ${this.formatDateTime(order.showtimeDate)}\n` +
      `Địa điểm: ${order.location}\n` +
      `Tổng thanh toán: ${this.formatVnd(order.totalAmount)}\n` +
      `Số lượng vé: ${order.tickets.length}\n\n` +
      `Danh sách vé:\n` +
      order.tickets
        .map(
          (t) =>
            `- Mã vé: ${t.ticketCode} | Hàng ${t.seatRow} - Ghế ${t.seatNumber} (${t.categoryName}) - Giá: ${this.formatVnd(t.price)}`,
        )
        .join('\n') +
      `\n\nVui lòng xem email dạng HTML hoặc đăng nhập ứng dụng để xem mã QR vào cửa.`;

    const mailOptions: SendMailOptions = {
      from: this.config.get<string>('SMTP_FROM') || 'noreply@event-ticketing.local',
      to: recipientEmail,
      subject,
      text,
      html,
      attachments,
    };

    // Retry loop up to maxAttempts with progressive backoff
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(
          `[Gửi email vé] Lần thử ${attempt}/${maxAttempts} tới ${recipientEmail} cho đơn hàng ${order.id}...`,
        );

        // Check if simulation failure flag is explicitly enabled for tests
        if (
          process.env.SIMULATE_EMAIL_FAILURE_ATTEMPTS &&
          attempt <= Number(process.env.SIMULATE_EMAIL_FAILURE_ATTEMPTS)
        ) {
          throw new Error(`Mô phỏng lỗi gửi mail lần thử ${attempt}`);
        }

        const info = await this.transporter.sendMail(mailOptions);
        this.logger.log(
          `[Gửi email vé] Thành công ở lần thử ${attempt} tới ${recipientEmail}. MessageId: ${info.messageId || 'local-ok'}`,
        );

        // Record successful delivery in database
        await this.prisma.emailLog.create({
          data: {
            orderId: order.id,
            recipient: recipientEmail,
            subject,
            attempts: attempt,
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        return {
          success: true,
          attempts: attempt,
          sentAt: new Date(),
        };
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `[Gửi email vé] Lần thử ${attempt}/${maxAttempts} thất bại: ${lastError.message}`,
        );

        if (attempt < maxAttempts) {
          // Progressive delay: 1000ms, 2000ms
          const delay = attempt * 1000;
          this.logger.log(`Chờ ${delay}ms trước khi thử lại lần ${attempt + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All 3 attempts failed - record failure in database for manual admin handling
    const errorMessage = lastError
      ? `${lastError.name}: ${lastError.message}`
      : 'Lỗi không xác định khi gửi email';

    this.logger.error(
      `[Gửi email vé] Cả ${maxAttempts} lần gửi email đều thất bại cho đơn hàng ${order.id}. Ghi nhận lỗi vào email_logs để quản trị xử lý tay.`,
    );

    await this.prisma.emailLog.create({
      data: {
        orderId: order.id,
        recipient: recipientEmail,
        subject,
        attempts: maxAttempts,
        status: 'FAILED',
        lastError: errorMessage,
      },
    });

    return {
      success: false,
      attempts: maxAttempts,
      error: `Gửi email thất bại sau ${maxAttempts} lần thử: ${errorMessage}. Hệ thống đã ghi nhận lỗi để quản trị viên xử lý tay.`,
    };
  }
}
