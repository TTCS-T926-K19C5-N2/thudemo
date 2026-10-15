import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DiscountType, OrderStatus } from '@prisma/client';
import { CouponsService } from './coupons.service.js';

describe('CouponsService (S-56 Event Coupons)', () => {
  let service: CouponsService;
  let mockPrisma: any;

  const mockOrganizerId = '11111111-1111-4111-8111-111111111111';
  const mockBuyerId = '22222222-2222-4222-8222-222222222222';
  const mockEventId = '33333333-3333-4333-8333-333333333333';
  const mockOrderId = '44444444-4444-4444-8444-444444444444';
  const mockCouponId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    mockPrisma = {
      event: {
        findUnique: vi.fn(),
      },
      coupon: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $executeRaw: vi.fn(),
    };
    service = new CouponsService(mockPrisma);
  });

  describe('createCoupon (S-56 AC1)', () => {
    it('cho phép ORGANIZER sở hữu sự kiện tạo mã giảm giá hợp lệ', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: mockEventId,
        organizerId: mockOrganizerId,
      });
      mockPrisma.coupon.findUnique.mockResolvedValue(null);
      const futureDate = new Date(Date.now() + 86400000);
      mockPrisma.coupon.create.mockImplementation((args: any) => ({
        id: mockCouponId,
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await service.createCoupon(
        mockOrganizerId,
        ['ORGANIZER'],
        mockEventId,
        {
          code: 'EARLYBIRD20',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          maxDiscount: 100000,
          minOrderAmount: 200000,
          maxUses: 50,
          expiresAt: futureDate.toISOString(),
        },
      );

      expect(result.code).toBe('EARLYBIRD20');
      expect(result.discountType).toBe(DiscountType.PERCENTAGE);
      expect(result.discountValue).toBe(20);
      expect(result.maxUses).toBe(50);
      expect(result.usedCount).toBe(0);
    });

    it('chặn người dùng khác không phải chủ sự kiện tạo mã (Forbidden)', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: mockEventId,
        organizerId: 'other-organizer-id',
      });

      await expect(
        service.createCoupon(
          mockOrganizerId,
          ['ORGANIZER'],
          mockEventId,
          {
            code: 'TEST10',
            discountType: 'PERCENTAGE',
            discountValue: 10,
            maxUses: 10,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('báo lỗi nếu tỉ lệ % giảm giá không hợp lệ (< 1% hoặc > 100%)', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: mockEventId,
        organizerId: mockOrganizerId,
      });

      await expect(
        service.createCoupon(
          mockOrganizerId,
          ['ORGANIZER'],
          mockEventId,
          {
            code: 'TEST10',
            discountType: 'PERCENTAGE',
            discountValue: 150,
            maxUses: 10,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('báo lỗi nếu mã giảm giá đã tồn tại trên hệ thống', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: mockEventId,
        organizerId: mockOrganizerId,
      });
      mockPrisma.coupon.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createCoupon(
          mockOrganizerId,
          ['ORGANIZER'],
          mockEventId,
          {
            code: 'DUPLICATE',
            discountType: 'FIXED_AMOUNT',
            discountValue: 50000,
            maxUses: 10,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('applyCouponToOrder (S-56 AC2)', () => {
    const baseOrder = {
      id: mockOrderId,
      userId: mockBuyerId,
      eventId: mockEventId,
      status: OrderStatus.PENDING_PAYMENT,
      items: [
        { unitPrice: 200000 },
        { unitPrice: 300000 },
      ], // Tổng tiền: 500,000 đ
    };

    const validCoupon = {
      id: mockCouponId,
      code: 'SALE20',
      eventId: mockEventId,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      maxDiscount: 50000, // Trần giảm 50k (20% của 500k là 100k -> bị trần 50k)
      minOrderAmount: 200000,
      maxUses: 10,
      usedCount: 0,
      isActive: true,
      validFrom: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() + 86400000),
    };

    it('áp dụng mã % có trần giảm giá đúng quy tắc', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder);
      mockPrisma.coupon.findUnique.mockResolvedValue(validCoupon);
      mockPrisma.order.update.mockResolvedValue({ ...baseOrder, discountAmount: 50000, totalAmount: 450000 });

      const result = await service.applyCouponToOrder(mockBuyerId, mockOrderId, {
        code: 'SALE20',
      });

      expect(result.originalTotal).toBe(500000);
      expect(result.discountAmount).toBe(50000);
      expect(result.finalTotal).toBe(450000);
      expect(result.couponCode).toBe('SALE20');
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: mockOrderId },
        data: {
          couponId: mockCouponId,
          discountAmount: 50000,
          totalAmount: 450000,
        },
      });
    });

    it('áp dụng mã số tiền cố định đúng và không vượt quá tổng tiền', async () => {
      const fixedCoupon = {
        ...validCoupon,
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 100000,
      };
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder);
      mockPrisma.coupon.findUnique.mockResolvedValue(fixedCoupon);
      mockPrisma.order.update.mockResolvedValue({ ...baseOrder, discountAmount: 100000, totalAmount: 400000 });

      const result = await service.applyCouponToOrder(mockBuyerId, mockOrderId, {
        code: 'FIXED100',
      });

      expect(result.originalTotal).toBe(500000);
      expect(result.discountAmount).toBe(100000);
      expect(result.finalTotal).toBe(400000);
    });

    it('từ chối mã nếu đơn hàng không đạt giá trị tối thiểu', async () => {
      const highMinCoupon = {
        ...validCoupon,
        minOrderAmount: 1000000, // Yêu cầu tối thiểu 1 triệu
      };
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder); // 500k
      mockPrisma.coupon.findUnique.mockResolvedValue(highMinCoupon);

      await expect(
        service.applyCouponToOrder(mockBuyerId, mockOrderId, { code: 'SALE20' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối mã nếu coupon đã hết lượt sử dụng', async () => {
      const exhaustedCoupon = {
        ...validCoupon,
        maxUses: 5,
        usedCount: 5,
      };
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder);
      mockPrisma.coupon.findUnique.mockResolvedValue(exhaustedCoupon);

      await expect(
        service.applyCouponToOrder(mockBuyerId, mockOrderId, { code: 'SALE20' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối mã nếu coupon thuộc sự kiện khác', async () => {
      const wrongEventCoupon = {
        ...validCoupon,
        eventId: 'different-event-id',
      };
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder);
      mockPrisma.coupon.findUnique.mockResolvedValue(wrongEventCoupon);

      await expect(
        service.applyCouponToOrder(mockBuyerId, mockOrderId, { code: 'SALE20' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeCouponFromOrder', () => {
    it('gỡ mã khôi phục số tiền gốc của đơn hàng', async () => {
      const orderWithCoupon = {
        id: mockOrderId,
        userId: mockBuyerId,
        status: OrderStatus.PENDING_PAYMENT,
        couponId: mockCouponId,
        discountAmount: 50000,
        totalAmount: 450000,
        items: [{ unitPrice: 500000 }],
      };
      mockPrisma.order.findUnique.mockResolvedValue(orderWithCoupon);
      mockPrisma.order.update.mockResolvedValue({
        ...orderWithCoupon,
        couponId: null,
        discountAmount: 0,
        totalAmount: 500000,
      });

      const result = await service.removeCouponFromOrder(mockBuyerId, mockOrderId);

      expect(result.discountAmount).toBe(0);
      expect(result.finalTotal).toBe(500000);
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: mockOrderId },
        data: {
          couponId: null,
          discountAmount: 0,
          totalAmount: 500000,
        },
      });
    });
  });

  describe('redeemCouponSafely & Concurrency-safe (S-56 AC3)', () => {
    it('trừ lượt dùng thành công khi usedCount < maxUses', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const success = await service.redeemCouponSafely(mockCouponId);
      expect(success).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('ném lỗi ConflictException khi hết lượt do tranh chấp đồng thời (0 dòng được update)', async () => {
      // Giả lập raw atomic update trả về 0 dòng vì "usedCount" < "maxUses" không còn thỏa mãn
      mockPrisma.$executeRaw.mockResolvedValue(0);

      await expect(service.redeemCouponSafely(mockCouponId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('mô phỏng 10 request đồng thời: chỉ các request thỏa mãn usedCount < maxUses mới thành công', async () => {
      const maxAvailableSlots = 3;
      let currentUsed = 0;

      // Giả lập câu lệnh UPDATE có điều kiện nguyên tử của PostgreSQL
      mockPrisma.$executeRaw.mockImplementation(async () => {
        if (currentUsed < maxAvailableSlots) {
          currentUsed++;
          return 1; // 1 row updated
        }
        return 0; // 0 rows updated
      });

      const promises = Array.from({ length: 10 }).map(() =>
        service.redeemCouponSafely(mockCouponId).then(
          () => ({ success: true }),
          () => ({ success: false }),
        ),
      );

      const results = await Promise.all(promises);
      const successfulCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      expect(successfulCount).toBe(3);
      expect(failedCount).toBe(7);
      expect(currentUsed).toBe(3);
    });
  });
});
