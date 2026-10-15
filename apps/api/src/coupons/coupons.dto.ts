export interface CreateCouponDto {
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscount?: number;
  minOrderAmount?: number;
  maxUses: number;
  validFrom?: string;
  expiresAt: string;
}

export interface ApplyCouponDto {
  code: string;
}

export interface CouponResponseDto {
  id: string;
  code: string;
  eventId: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscount: number | null;
  minOrderAmount: number | null;
  maxUses: number;
  usedCount: number;
  validFrom: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface ApplyCouponResultDto {
  orderId: string;
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
  couponCode: string;
  message: string;
}
