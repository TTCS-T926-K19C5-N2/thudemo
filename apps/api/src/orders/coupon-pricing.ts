export type CouponDiscount =
  | { type: 'PERCENT'; value: number }
  | { type: 'FIXED'; value: number };

export type CouponPrice = {
  subtotalAmount: number;
  discountAmount: number;
  payableAmount: number;
};

/** Calculate coupon money in integer VND using the approved D01 rules. */
export function priceWithCoupon(
  subtotalAmount: number,
  coupon: CouponDiscount,
): CouponPrice {
  if (!Number.isSafeInteger(subtotalAmount) || subtotalAmount < 0)
    throw new RangeError('Subtotal must be a non-negative safe integer VND amount.');
  if (!Number.isSafeInteger(coupon.value) || coupon.value <= 0)
    throw new RangeError('Coupon value must be a positive safe integer.');

  let rawDiscount: bigint;
  if (coupon.type === 'PERCENT') {
    if (coupon.value > 100)
      throw new RangeError('Percentage coupon cannot exceed 100 percent.');
    rawDiscount =
      (BigInt(subtotalAmount) * BigInt(coupon.value)) / BigInt(100);
  } else {
    rawDiscount = BigInt(coupon.value);
  }

  const discountAmount = Number(
    rawDiscount > BigInt(subtotalAmount)
      ? BigInt(subtotalAmount)
      : rawDiscount,
  );
  return {
    subtotalAmount,
    discountAmount,
    payableAmount: subtotalAmount - discountAmount,
  };
}
