import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export interface WebhookPayload {
  orderCode?: string;
  orderId?: string;
  transactionId?: string;
  status?: string;
  amount?: number;
  [key: string]: unknown;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly webhookSecret =
    process.env.PAYMENT_WEBHOOK_SECRET || 'default-payment-webhook-secret-key-2026';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tính chữ ký HMAC-SHA256 cho payload dữ liệu
   */
  computeSignature(payload: string | Buffer): string {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Xác thực chữ ký an toàn với timingSafeEqual chống tấn công thời gian (timing attacks)
   */
  verifySignature(payload: string | Buffer, signature?: string): boolean {
    if (!signature || !payload) return false;
    try {
      const expected = this.computeSignature(payload);
      const sigBuf = Buffer.from(signature.trim(), 'utf8');
      const expBuf = Buffer.from(expected.trim(), 'utf8');
      if (sigBuf.length !== expBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  /**
   * SCRUM-32 (S-21): Xử lý webhook thanh toán
   * AC1: Chữ ký không khớp -> trả 401, không đọc nội dung, không đổi đơn, ghi log kèm địa chỉ nguồn.
   * AC2: Chữ ký đúng nhưng mã đơn không tồn tại -> trả 404 và ghi log.
   */
  async handleWebhook(
    rawBody: Buffer | string,
    signatureHeader: string | undefined,
    clientIp: string,
  ) {
    // 1. Kiểm tra chữ ký webhook trước tiên
    const isValidSignature = this.verifySignature(rawBody, signatureHeader);
    if (!isValidSignature) {
      this.logger.warn(
        `[Webhook Security] Chữ ký webhook không hợp lệ từ địa chỉ nguồn IP: ${clientIp}`,
      );
      throw new UnauthorizedException(
        'Chữ ký webhook không hợp lệ. Yêu cầu bị từ chối.',
      );
    }

    // 2. Chữ ký hợp lệ -> đọc nội dung payload
    let payload: WebhookPayload;
    try {
      const rawString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
      payload = JSON.parse(rawString);
    } catch {
      this.logger.error(`[Webhook] Định dạng payload không phải JSON hợp lệ.`);
      throw new NotFoundException('Dữ liệu webhook không hợp lệ.');
    }

    const orderIdentifier = payload.orderCode || payload.orderId;
    if (!orderIdentifier) {
      this.logger.warn(
        `[Webhook] Thiếu thông tin mã đơn hàng trong payload webhook.`,
      );
      throw new NotFoundException('Mã đơn hàng không được cung cấp.');
    }

    // 3. Tìm kiếm đơn hàng theo orderCode hoặc id (kiểm tra an toàn cú pháp UUID)
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        orderIdentifier,
      );

    const order = await this.prisma.order.findFirst({
      where: isUuid
        ? {
            OR: [{ id: orderIdentifier }, { orderCode: orderIdentifier }],
          }
        : { orderCode: orderIdentifier },
      include: {
        event: true,
      },
    });

    // AC2: Đúng chữ ký nhưng mã đơn không tồn tại
    if (!order) {
      this.logger.warn(
        `[Webhook] Nhận webhook hợp lệ nhưng mã đơn hàng không tồn tại: ${orderIdentifier}`,
      );
      throw new NotFoundException(
        `Không tìm thấy đơn hàng với mã: ${orderIdentifier}`,
      );
    }

    // 4. Cập nhật đơn hàng thành PAID
    const transactionId =
      payload.transactionId || `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const ticketUrl = `/orders/${order.id}/ticket`;

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        transactionId,
        ticketUrl,
      },
    });

    this.logger.log(
      `[Webhook] Xác nhận thanh toán thành công cho đơn hàng: ${order.orderCode} (ID: ${order.id})`,
    );

    return {
      success: true,
      message: 'Xác nhận thanh toán thành công.',
      orderCode: updatedOrder.orderCode,
      status: updatedOrder.status,
      ticketUrl: updatedOrder.ticketUrl,
    };
  }

  /**
   * SCRUM-33 (S-22): Lấy trạng thái thực tế từ máy chủ (Server-authoritative)
   */
  async getOrderStatus(orderIdOrCode: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        orderIdOrCode,
      );

    const order = await this.prisma.order.findFirst({
      where: isUuid
        ? {
            OR: [{ id: orderIdOrCode }, { orderCode: orderIdOrCode }],
          }
        : { orderCode: orderIdOrCode },
      include: {
        event: true,
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Không tìm thấy đơn hàng với mã hoặc ID: ${orderIdOrCode}`,
      );
    }

    return {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status, // PENDING, PAID, CANCELLED
      amount: order.amount,
      eventName: order.event?.name ?? 'Vé tham gia sự kiện',
      transactionId: order.transactionId,
      ticketUrl: order.status === 'PAID' ? (order.ticketUrl || `/orders/${order.id}/ticket`) : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Tạo đơn hàng mới để phục vụ đặt vé và test luồng thanh toán
   */
  async createOrder(data: {
    eventId?: string;
    userId?: string;
    amount?: number;
  }) {
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderCode = `ORD-${Date.now().toString(36).toUpperCase()}-${randomSuffix}`;

    return this.prisma.order.create({
      data: {
        orderCode,
        eventId: data.eventId,
        userId: data.userId,
        amount: data.amount ?? 150000,
        status: 'PENDING',
      },
      include: {
        event: true,
      },
    });
  }

  /**
   * Lấy danh sách đơn hàng của người dùng phục vụ AC3 (Xem lịch sử đơn)
   */
  async findMine(userId?: string) {
    return this.prisma.order.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        event: true,
      },
    });
  }
}

