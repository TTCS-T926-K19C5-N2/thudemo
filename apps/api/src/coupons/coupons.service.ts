import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DiscountType, OrderStatus, Prisma } from '@prisma/client';
import type {
  ApplyCouponDto,
  ApplyCouponResultDto,
  CouponResponseDto,
  CreateCouponDto,
} from './coupons.dto.js';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Xác thực quyền quản lý sự kiện (Chỉ ORGANIZER sở hữu sự kiện hoặc ADMIN)
   */
  async verifyOrganizerEventAccess(
    eventId: string,
    userId: string,
    roles: string[],
  ): Promise<void> {
    if (roles.includes('ADMIN')) return;

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true },
    });

    if (!event) {
      throw new NotFoundException('Không tìm thấy sự kiện.');
    }

    if (event.organizerId !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền quản trị mã giảm giá của sự kiện này.',
      );
    }
  }

  /**
   * S-56 AC1: Ban tổ chức tạo mã giảm giá cho sự kiện
   */
  async createCoupon(
    userId: string,
    roles: string[],
    eventId: string,
    dto: CreateCouponDto,
  ): Promise<CouponResponseDto> {
    await this.verifyOrganizerEventAccess(eventId, userId, roles);

    const cleanCode = dto.code ? dto.code.trim().toUpperCase() : '';
    if (!cleanCode || cleanCode.length < 3 || cleanCode.length > 30) {
      throw new BadRequestException(
        'Mã giảm giá phải từ 3 đến 30 ký tự chữ cái hoặc số.',
      );
    }

    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      throw new BadRequestException(
        'Mã giảm giá chỉ được chứa chữ cái, chữ số, dấu gạch nối và gạch dưới.',
      );
    }

    const discountType =
      dto.discountType === 'PERCENTAGE'
        ? DiscountType.PERCENTAGE
        : DiscountType.FIXED_AMOUNT;

    const discountValue = Number(dto.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      throw new BadRequestException('Giá trị giảm phải là số nguyên dương.');
    }

    if (discountType === DiscountType.PERCENTAGE && (discountValue < 1 || discountValue > 100)) {
      throw new BadRequestException(
        'Tỉ lệ giảm giá theo phần trăm phải nằm trong khoảng từ 1% đến 100%.',
      );
    }

    const maxUses = Number(dto.maxUses);
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      throw new BadRequestException('Số lượt sử dụng tối đa phải lớn hơn 0.');
    }

    const expiresAt = new Date(dto.expiresAt);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Hạn dùng mã giảm giá phải ở tương lai.');
    }

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();

    // Kiểm tra trùng mã code
    const existing = await this.prisma.coupon.findUnique({
      where: { code: cleanCode },
    });
    if (existing) {
      throw new ConflictException(`Mã giảm giá "${cleanCode}" đã tồn tại trên hệ thống.`);
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code: cleanCode,
        eventId,
        discountType,
        discountValue,
        maxDiscount: dto.maxDiscount ? Number(dto.maxDiscount) : null,
        minOrderAmount: dto.minOrderAmount ? Number(dto.minOrderAmount) : 0,
        maxUses,
        usedCount: 0,
        validFrom,
        expiresAt,
        isActive: true,
      },
    });

    return this.mapCouponToDto(coupon);
  }

  /**
   * S-56: Ban tổ chức xem danh sách mã giảm giá của sự kiện
   */
  async getEventCoupons(
    userId: string,
    roles: string[],
    eventId: string,
  ): Promise<CouponResponseDto[]> {
    await this.verifyOrganizerEventAccess(eventId, userId, roles);

    const coupons = await this.prisma.coupon.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });

    return coupons.map((c) => this.mapCouponToDto(c));
  }

  /**
   * S-56 AC2: Người mua nhập mã ở trang đơn hàng, tổng tiền giảm đúng và số lượt trừ đúng
   */
  async applyCouponToOrder(
    userId: string,
    orderId: string,
    dto: ApplyCouponDto,
  ): Promise<ApplyCouponResultDto> {
    const cleanCode = dto.code ? dto.code.trim().toUpperCase() : '';
    if (!cleanCode) {
      throw new BadRequestException('Vui lòng nhập mã giảm giá.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        showtime: {
          select: { eventId: true },
        },
      },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        'Chỉ có thể áp dụng mã giảm giá cho đơn hàng đang chờ thanh toán.',
      );
    }

    // Tính tổng tiền gốc các vé
    const originalTotal = order.items.reduce(
      (sum, item) => sum + item.unitPrice,
      0,
    );

    // Tìm mã giảm giá
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: cleanCode },
    });

    if (!coupon) {
      throw new NotFoundException('Mã giảm giá không tồn tại.');
    }

    // Kiểm tra sự kiện
    const eventId = order.eventId ?? order.showtime?.eventId;
    if (coupon.eventId !== eventId) {
      throw new BadRequestException(
        'Mã giảm giá này không áp dụng cho sự kiện hiện tại.',
      );
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Mã giảm giá này hiện đang tạm khóa.');
    }

    const now = new Date();
    if (now < coupon.validFrom) {
      throw new BadRequestException('Mã giảm giá chưa đến ngày có hiệu lực.');
    }
    if (now > coupon.expiresAt) {
      throw new BadRequestException('Mã giảm giá đã hết hạn sử dụng.');
    }

    if (coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng.');
    }

    if (coupon.minOrderAmount && originalTotal < coupon.minOrderAmount) {
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu ${coupon.minOrderAmount.toLocaleString('vi-VN')} đ để áp dụng mã này.`,
      );
    }

    // Tính số tiền giảm
    let discountAmount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discountAmount = Math.round((originalTotal * coupon.discountValue) / 100);
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.discountValue;
    }

    // Không để giảm vượt quá tổng tiền đơn
    discountAmount = Math.min(discountAmount, originalTotal);
    const finalTotal = Math.max(0, originalTotal - discountAmount);

    // Cập nhật đơn hàng
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        couponId: coupon.id,
        discountAmount,
        totalAmount: finalTotal,
      },
    });

    return {
      orderId: order.id,
      originalTotal,
      discountAmount,
      finalTotal,
      couponCode: coupon.code,
      message: `Áp dụng mã ${coupon.code} thành công. Tiết kiệm ${discountAmount.toLocaleString('vi-VN')} đ.`,
    };
  }

  /**
   * Người mua gỡ mã giảm giá khỏi đơn hàng
   */
  async removeCouponFromOrder(
    userId: string,
    orderId: string,
  ): Promise<ApplyCouponResultDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        'Không thể sửa mã giảm giá của đơn hàng này.',
      );
    }

    const originalTotal = order.items.reduce(
      (sum, item) => sum + item.unitPrice,
      0,
    );

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        couponId: null,
        discountAmount: 0,
        totalAmount: originalTotal,
      },
    });

    return {
      orderId: order.id,
      originalTotal,
      discountAmount: 0,
      finalTotal: originalTotal,
      couponCode: '',
      message: 'Đã gỡ mã giảm giá khỏi đơn hàng.',
    };
  }

  /**
   * S-56 AC3: Trừ số lượt dùng đúng kể cả khi nhiều người dùng cùng lúc (Concurrency-safe)
   */
  async redeemCouponSafely(
    couponId: string,
    prismaTx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = prismaTx ?? this.prisma;

    // Sử dụng câu lệnh UPDATE có điều kiện (atomic conditional update)
    // Đảm bảo chỉ tăng usedCount khi usedCount < maxUses, chống race-condition 100%
    const updatedCount = await client.$executeRaw(Prisma.sql`
      UPDATE "coupons"
      SET "usedCount" = "usedCount" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${couponId}::uuid
        AND "isActive" = true
        AND "expiresAt" > CURRENT_TIMESTAMP
        AND "usedCount" < "maxUses"
    `);

    if (updatedCount === 0) {
      throw new ConflictException(
        'Mã giảm giá đã hết lượt sử dụng hoặc không còn hiệu lực tại thời điểm thanh toán.',
      );
    }

    return true;
  }

  /**
   * Hoàn trả lượt dùng mã khi đơn hàng bị hủy hoặc hết hạn
   */
  async revertCouponUsage(
    couponId: string,
    prismaTx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = prismaTx ?? this.prisma;
    await client.$executeRaw(Prisma.sql`
      UPDATE "coupons"
      SET "usedCount" = GREATEST(0, "usedCount" - 1),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${couponId}::uuid
    `);
  }

  private mapCouponToDto(c: any): CouponResponseDto {
    return {
      id: c.id,
      code: c.code,
      eventId: c.eventId,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxDiscount: c.maxDiscount,
      minOrderAmount: c.minOrderAmount,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      validFrom: c.validFrom.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
