import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService, OrderEmailData } from '../mail/mail.service.js';

type ValidSeat = {
  id: string;
  row: string;
  seatNumber: number;
  categoryName: string;
  price: number;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async checkout(
    showtimeId: string,
    userId: string,
    userEmail: string,
    seatIds: string[],
  ) {
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một ghế để thanh toán.');
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(showtimeId)) {
      throw new BadRequestException('Mã suất diễn không hợp lệ.');
    }

    const uniqueIds = Array.from(new Set(seatIds.map((id) => id.toLowerCase())));
    if (uniqueIds.some((id) => !uuidRegex.test(id))) {
      throw new BadRequestException('Danh sách ghế chứa mã không hợp lệ.');
    }

    // 1. Transaction to atomically verify holds, generate Order and Tickets, and release holds
    const createdOrder = await this.prisma.$transaction(async (tx) => {
      // Verify showtime is valid and ON_SALE
      const showtime = await tx.showtime.findUnique({
        where: { id: showtimeId },
        include: { event: true },
      });

      if (!showtime) {
        throw new NotFoundException('Không tìm thấy suất diễn.');
      }
      if (showtime.status !== 'ON_SALE') {
        throw new BadRequestException('Suất diễn không trong trạng thái mở bán.');
      }

      // Check if user currently holds these seats and holds are not expired and not already ticketed
      const validSeats = await tx.$queryRaw<ValidSeat[]>(Prisma.sql`
        SELECT s.id, s.row, s."seatNumber", c.name AS "categoryName", c.price
        FROM seats s
        JOIN seat_categories c ON c.id = s."categoryId" AND c."showtimeId" = s."showtimeId"
        JOIN seat_holds h ON h."seatId" = s.id AND h."showtimeId" = ${showtimeId}::uuid
        JOIN hold_sessions hs ON hs.id = h."holdSessionId"
        WHERE s."showtimeId" = ${showtimeId}::uuid
          AND s.id IN (${Prisma.join(uniqueIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND hs."userId" = ${userId}::uuid
          AND h."expiresAt" > clock_timestamp()
          AND c.price IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t."seatId" = s.id)
      `);

      if (validSeats.length !== uniqueIds.length) {
        throw new BadRequestException(
          'Một số ghế chưa được bạn giữ hoặc đã hết hạn thời gian giữ 10 phút. Vui lòng chọn lại ghế.',
        );
      }

      const totalAmount = validSeats.reduce((sum, s) => sum + s.price, 0);

      // Create Order
      const order = await tx.order.create({
        data: {
          id: randomUUID(),
          userId,
          showtimeId,
          totalAmount,
          status: 'PAID',
          customerEmail: userEmail,
        },
      });

      // Create tickets for each seat
      for (const seat of validSeats) {
        const ticketCode = `TKT-${randomBytes(4).toString('hex').toUpperCase()}`;
        const qrPayload = JSON.stringify({
          ticketCode,
          orderId: order.id,
          seat: `${seat.row}-${seat.seatNumber}`,
          showtimeId,
          event: showtime.event.name,
        });

        const { dataUrl } = await this.mailService.generateQrCode(qrPayload);

        await tx.ticket.create({
          data: {
            id: randomUUID(),
            orderId: order.id,
            seatId: seat.id,
            ticketCode,
            qrCodeData: qrPayload,
            qrCodeImage: dataUrl,
            price: seat.price,
          },
        });
      }

      // Release seat holds now that tickets are issued
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM seat_holds
        WHERE "seatId" IN (${Prisma.join(uniqueIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);

      return order;
    });

    // 2. Query full order details for response and email
    const fullOrder = await this.getOrderDetails(createdOrder.id);
    if (!fullOrder) {
      throw new NotFoundException('Không tìm thấy thông tin đơn hàng sau khi tạo.');
    }

    // 3. Send confirmation email with QR codes and retry mechanism
    const emailData: OrderEmailData = {
      id: fullOrder.id,
      customerEmail: fullOrder.customerEmail,
      totalAmount: fullOrder.totalAmount,
      eventName: fullOrder.showtime.event.name,
      showtimeDate: fullOrder.showtime.startTime,
      location: fullOrder.showtime.event.location,
      tickets: fullOrder.tickets.map((t) => ({
        id: t.id,
        ticketCode: t.ticketCode,
        seatRow: t.seat.row,
        seatNumber: t.seat.seatNumber,
        categoryName: t.seat.category.name,
        price: t.price,
        qrCodeData: t.qrCodeData,
        qrCodeImage: t.qrCodeImage,
      })),
    };

    const emailResult = await this.mailService.sendTicketEmail(emailData, userEmail);

    return {
      order: fullOrder,
      emailResult,
    };
  }

  async resendEmail(userId: string, orderId: string) {
    // 1. Fetch existing order and tickets - NEVER CREATE NEW TICKETS
    const fullOrder = await this.getOrderDetails(orderId);

    if (!fullOrder) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    if (fullOrder.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác trên đơn hàng này.');
    }

    this.logger.log(
      `[Gửi lại vé] Yêu cầu gửi lại vé cho đơn hàng ${orderId} (tổng ${fullOrder.tickets.length} vé đã có). KHÔNG tạo vé mới.`,
    );

    // 2. Prepare email payload using EXACT existing tickets
    const emailData: OrderEmailData = {
      id: fullOrder.id,
      customerEmail: fullOrder.customerEmail,
      totalAmount: fullOrder.totalAmount,
      eventName: fullOrder.showtime.event.name,
      showtimeDate: fullOrder.showtime.startTime,
      location: fullOrder.showtime.event.location,
      tickets: fullOrder.tickets.map((t) => ({
        id: t.id,
        ticketCode: t.ticketCode,
        seatRow: t.seat.row,
        seatNumber: t.seat.seatNumber,
        categoryName: t.seat.category.name,
        price: t.price,
        qrCodeData: t.qrCodeData,
        qrCodeImage: t.qrCodeImage,
      })),
    };

    // 3. Send email with retry up to 3 times
    const emailResult = await this.mailService.sendTicketEmail(
      emailData,
      fullOrder.customerEmail,
    );

    return {
      success: emailResult.success,
      order: fullOrder,
      emailResult,
    };
  }

  async getUserOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        showtime: {
          include: {
            event: true,
          },
        },
        tickets: {
          include: {
            seat: {
              include: {
                category: true,
              },
            },
          },
        },
        emailLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrderDetails(orderId: string, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        showtime: {
          include: {
            event: true,
          },
        },
        tickets: {
          include: {
            seat: {
              include: {
                category: true,
              },
            },
          },
        },
        emailLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy thông tin đơn hàng.');
    }

    if (userId && order.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập đơn hàng này.');
    }

    return order;
  }
}
