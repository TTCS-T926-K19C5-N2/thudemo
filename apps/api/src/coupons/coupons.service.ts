import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponRedemptionStatus,
  CouponType,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { priceWithCoupon } from '../orders/coupon-pricing.js';

const couponCodePattern = /^[A-Z0-9_-]{3,32}$/;

type CouponInput = {
  code: string;
  type: CouponType;
  value: number;
  maxUses: number;
  startsAt: Date;
  expiresAt: Date;
  isActive: boolean;
};

function parseCouponInput(value: unknown, current?: CouponInput): CouponInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Dữ liệu mã giảm giá không hợp lệ.');
  const raw = value as Record<string, unknown>;
  const code = raw.code === undefined ? current?.code : raw.code;
  const type = raw.type === undefined ? current?.type : raw.type;
  const discountValue = raw.value === undefined ? current?.value : raw.value;
  const maxUses = raw.maxUses === undefined ? current?.maxUses : raw.maxUses;
  const startsAtRaw = raw.startsAt === undefined ? current?.startsAt : raw.startsAt;
  const expiresAtRaw = raw.expiresAt === undefined ? current?.expiresAt : raw.expiresAt;
  const isActive = raw.isActive === undefined ? (current?.isActive ?? true) : raw.isActive;
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const startsAt = startsAtRaw instanceof Date ? startsAtRaw : new Date(String(startsAtRaw));
  const expiresAt = expiresAtRaw instanceof Date ? expiresAtRaw : new Date(String(expiresAtRaw));
  if (!couponCodePattern.test(normalizedCode))
    throw new BadRequestException('Mã gồm 3–32 ký tự chữ, số, gạch ngang hoặc gạch dưới.');
  if (type !== CouponType.FIXED && type !== CouponType.PERCENT)
    throw new BadRequestException('Loại giảm giá không hợp lệ.');
  if (!Number.isSafeInteger(discountValue) || Number(discountValue) <= 0)
    throw new BadRequestException('Giá trị giảm phải là số nguyên dương.');
  if (type === CouponType.PERCENT && Number(discountValue) > 100)
    throw new BadRequestException('Tỷ lệ giảm tối đa là 100%.');
  if (!Number.isSafeInteger(maxUses) || Number(maxUses) <= 0)
    throw new BadRequestException('Số lượt dùng phải là số nguyên dương.');
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt)
    throw new BadRequestException('Thời hạn mã giảm giá không hợp lệ.');
  if (typeof isActive !== 'boolean')
    throw new BadRequestException('Trạng thái mã giảm giá không hợp lệ.');
  return {
    code: normalizedCode,
    type,
    value: Number(discountValue),
    maxUses: Number(maxUses),
    startsAt,
    expiresAt,
    isActive,
  };
}

@Injectable()
export class CouponsService {
  constructor(
    private readonly db: PrismaService,
    private readonly tickets: TicketsService,
  ) {}

  private async requireEventOwner(
    tx: Prisma.TransactionClient | PrismaService,
    eventId: string,
    organizerId: string,
  ) {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện.');
    if (event.organizerId !== organizerId)
      throw new ForbiddenException('Bạn không có quyền quản lý sự kiện này.');
    return event;
  }

  async listForOwner(eventId: string, organizerId: string) {
    await this.requireEventOwner(this.db, eventId, organizerId);
    const coupons = await this.db.coupon.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
    return {
      coupons: coupons.map(({ _count, ...coupon }) => ({
        ...coupon,
        redemptionRecords: _count.redemptions,
      })),
    };
  }

  async createForOwner(eventId: string, organizerId: string, input: unknown) {
    await this.requireEventOwner(this.db, eventId, organizerId);
    const data = parseCouponInput(input);
    try {
      return await this.db.coupon.create({ data: { ...data, eventId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Mã này đã được tạo cho sự kiện.');
      throw error;
    }
  }

  async updateForOwner(
    eventId: string,
    couponId: string,
    organizerId: string,
    input: unknown,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.requireEventOwner(tx, eventId, organizerId);
      await tx.$queryRaw`SELECT id FROM coupons WHERE id=${couponId}::uuid AND "eventId"=${eventId}::uuid FOR UPDATE`;
      const coupon = await tx.coupon.findFirst({ where: { id: couponId, eventId } });
      if (!coupon) throw new NotFoundException('Không tìm thấy mã giảm giá.');
      const data = parseCouponInput(input, coupon);
      const activeUses = await tx.couponRedemption.count({
        where: {
          couponId,
          OR: [
            { status: CouponRedemptionStatus.REDEEMED },
            {
              status: CouponRedemptionStatus.RESERVED,
              order: {
                status: { in: [OrderStatus.PENDING, OrderStatus.PENDING_PAYMENT] },
                paymentExpiresAt: { gt: new Date() },
              },
            },
          ],
        },
      });
      if (data.maxUses < activeUses)
        throw new ConflictException('Số lượt tối đa không thể thấp hơn lượt đã giữ hoặc đã dùng.');
      try {
        return await tx.coupon.update({ where: { id: couponId }, data });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('Mã này đã được tạo cho sự kiện.');
        throw error;
      }
    });
  }

  async deactivateForOwner(eventId: string, couponId: string, organizerId: string) {
    await this.requireEventOwner(this.db, eventId, organizerId);
    const updated = await this.db.coupon.updateMany({
      where: { id: couponId, eventId },
      data: { isActive: false },
    });
    if (!updated.count) throw new NotFoundException('Không tìm thấy mã giảm giá.');
    return { id: couponId, isActive: false };
  }

  async applyToOrder(orderId: string, userId: string, input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof (input as Record<string, unknown>).code !== 'string')
      throw new BadRequestException('Nhập mã giảm giá.');
    const code = String((input as Record<string, unknown>).code).trim().toUpperCase();
    if (!couponCodePattern.test(code)) throw new BadRequestException('Mã giảm giá không hợp lệ.');

    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${orderId}::uuid AND "userId"=${userId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        include: { items: { include: { seat: { select: { row: true, seatNumber: true } } } } },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PENDING_PAYMENT)
        throw new ConflictException('Chỉ có thể áp mã cho đơn đang chờ thanh toán.');
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const expiresAt = order.paymentExpiresAt ?? order.expiresAt;
      if (!expiresAt || expiresAt <= clock.now)
        throw new ConflictException('Đơn hàng đã hết hạn.');
      const activePayment = await tx.payment.findFirst({ where: { orderId, status: PaymentStatus.INITIATED } });
      if (activePayment)
        throw new ConflictException('Đang có giao dịch thanh toán; không thể đổi giá trị đơn.');

      if (!order.eventId)
        throw new ConflictException('Đơn hàng không gắn với sự kiện nên không thể áp mã.');
      const coupon = await tx.coupon.findFirst({ where: { eventId: order.eventId, code } });
      if (!coupon) throw new BadRequestException('Mã không áp dụng cho sự kiện này.');
      await tx.$queryRaw`SELECT id FROM coupons WHERE id=${coupon.id}::uuid FOR UPDATE`;
      const lockedCoupon = await tx.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      if (!lockedCoupon.isActive || lockedCoupon.startsAt > clock.now || lockedCoupon.expiresAt <= clock.now)
        throw new BadRequestException('Mã giảm giá chưa có hiệu lực hoặc đã hết hạn.');
      const [usage] = await tx.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::integer AS count
        FROM coupon_redemptions r JOIN orders o ON o.id=r."orderId"
        WHERE r."couponId"=${coupon.id}::uuid AND r."orderId"<>${orderId}::uuid
          AND (r.status='REDEEMED' OR (r.status='RESERVED'
            AND o.status IN ('PENDING','PENDING_PAYMENT')
            AND COALESCE(o."paymentExpiresAt",o."expiresAt")>clock_timestamp()))`);
      if (usage.count >= lockedCoupon.maxUses)
        throw new ConflictException('Mã giảm giá đã hết lượt sử dụng.');

      const subtotalAmount = order.items.reduce((sum, item) => sum + item.unitPrice, 0);
      if (subtotalAmount !== order.subtotalAmount)
        throw new ConflictException('Snapshot đơn hàng không khớp tổng các vé; cần đối soát trước khi áp mã.');
      const price = priceWithCoupon(subtotalAmount, { type: lockedCoupon.type, value: lockedCoupon.value });
      const now = clock.now;
      await tx.couponRedemption.upsert({
        where: { orderId },
        create: {
          couponId: lockedCoupon.id,
          orderId,
          userId,
          status: CouponRedemptionStatus.RESERVED,
          discountAmount: price.discountAmount,
          codeSnapshot: lockedCoupon.code,
          reservedAt: now,
        },
        update: {
          couponId: lockedCoupon.id,
          status: CouponRedemptionStatus.RESERVED,
          discountAmount: price.discountAmount,
          codeSnapshot: lockedCoupon.code,
          reservedAt: now,
          redeemedAt: null,
          releasedAt: null,
        },
      });
      const confirmedFree = price.payableAmount === 0;
      if (confirmedFree) {
        const seatIds = order.items.map((item) => item.seatId);
        if (!order.holdSessionId || !order.holdToken || seatIds.length === 0)
          throw new ConflictException('Không thể xác nhận đơn 0₫ khi đơn không còn giữ ghế hợp lệ.');
        const heldSeats = await tx.$queryRaw<{ seatId: string }[]>(Prisma.sql`
          SELECT h."seatId" AS "seatId"
          FROM seat_holds h
          JOIN order_items oi ON oi."seatId"=h."seatId" AND oi."orderId"=${orderId}::uuid
          WHERE h."showtimeId"=${order.showtimeId}::uuid
            AND h."holdSessionId"=${order.holdSessionId}::uuid
            AND h.token=${order.holdToken}::uuid
            AND h."expiresAt">clock_timestamp()
          ORDER BY h."seatId" FOR UPDATE OF h`);
        if (heldSeats.length !== seatIds.length)
          throw new ConflictException('Một hoặc nhiều ghế không còn được giữ bởi đơn này.');
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM seats WHERE id IN (${Prisma.join(seatIds.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY id FOR UPDATE`);
      }
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          couponId: lockedCoupon.id,
          couponCodeSnapshot: lockedCoupon.code,
          couponTypeSnapshot: lockedCoupon.type,
          couponValueSnapshot: lockedCoupon.value,
          subtotalAmount: price.subtotalAmount,
          discountAmount: price.discountAmount,
          totalAmount: price.payableAmount,
          ...(confirmedFree ? { status: OrderStatus.PAID } : {}),
        },
      });
      if (confirmedFree) {
        const seatIds = order.items.map((item) => item.seatId);
        const sold = await tx.seat.updateMany({ where: { id: { in: seatIds }, isSold: false }, data: { isSold: true } });
        if (sold.count !== seatIds.length)
          throw new ConflictException('Một hoặc nhiều ghế không còn trống; không thể xác nhận đơn 0₫.');
        await tx.seatHold.deleteMany({ where: { seatId: { in: seatIds } } });
        await this.tickets.issueForPaidOrder(tx, {
          id: order.id,
          showtimeId: order.showtimeId,
          items: order.items.map((item) => ({
            seatId: item.seatId,
            categoryName: item.categoryName,
            unitPrice: item.unitPrice,
            seat: item.seat,
          })),
        });
        await tx.couponRedemption.update({
          where: { orderId },
          data: { status: CouponRedemptionStatus.REDEEMED, redeemedAt: now },
        });
      }
      await tx.orderLog.create({
        data: {
          orderId,
          type: confirmedFree ? 'FREE_ORDER_CONFIRMED' : 'COUPON_APPLIED',
          detail: {
            couponId: lockedCoupon.id,
            couponCode: lockedCoupon.code,
            subtotalAmount: price.subtotalAmount,
            discountAmount: price.discountAmount,
            payableAmount: price.payableAmount,
          },
        },
      });
      return {
        order: {
          id: updated.id,
          status: updated.status,
          subtotalAmount: updated.subtotalAmount,
          discountAmount: updated.discountAmount,
          totalAmount: updated.totalAmount,
          couponCode: updated.couponCodeSnapshot,
        },
        confirmedFree,
      };
    });
  }

  async removeFromOrder(orderId: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${orderId}::uuid AND "userId"=${userId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id: orderId, userId } });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PENDING_PAYMENT)
        throw new ConflictException('Chỉ có thể bỏ mã trên đơn đang chờ thanh toán.');
      if (await tx.payment.findFirst({ where: { orderId, status: PaymentStatus.INITIATED } }))
        throw new ConflictException('Đang có giao dịch thanh toán; không thể đổi giá trị đơn.');
      await tx.couponRedemption.updateMany({
        where: { orderId, status: CouponRedemptionStatus.RESERVED },
        data: { status: CouponRedemptionStatus.RELEASED, releasedAt: new Date() },
      });
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          couponId: null,
          couponCodeSnapshot: null,
          couponTypeSnapshot: null,
          couponValueSnapshot: null,
          discountAmount: 0,
          totalAmount: order.subtotalAmount,
        },
      });
      await tx.orderLog.create({ data: { orderId, type: 'COUPON_REMOVED' } });
      return {
        order: {
          id: updated.id,
          status: updated.status,
          subtotalAmount: updated.subtotalAmount,
          discountAmount: updated.discountAmount,
          totalAmount: updated.totalAmount,
          couponCode: null,
        },
      };
    });
  }
}
