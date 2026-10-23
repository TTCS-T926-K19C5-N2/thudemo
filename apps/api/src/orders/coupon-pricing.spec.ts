import { describe, expect, it } from 'vitest';
import { priceWithCoupon } from './coupon-pricing.js';

describe('priceWithCoupon (approved D01 rules)', () => {
  it('floors percentage discounts to whole VND', () => {
    expect(priceWithCoupon(10_001, { type: 'PERCENT', value: 15 })).toEqual({
      subtotalAmount: 10_001,
      discountAmount: 1_500,
      payableAmount: 8_501,
    });
  });

  it('clamps a fixed discount to the subtotal and supports zero payable', () => {
    expect(priceWithCoupon(500, { type: 'FIXED', value: 900 })).toEqual({
      subtotalAmount: 500,
      discountAmount: 500,
      payableAmount: 0,
    });
  });

  it('allows a 100 percent discount and never returns a negative amount', () => {
    expect(priceWithCoupon(12_345, { type: 'PERCENT', value: 100 })).toEqual({
      subtotalAmount: 12_345,
      discountAmount: 12_345,
      payableAmount: 0,
    });
  });

  it.each([
    [-1, { type: 'FIXED', value: 1 }],
    [1.2, { type: 'FIXED', value: 1 }],
    [1, { type: 'PERCENT', value: 101 }],
    [1, { type: 'PERCENT', value: 1.5 }],
    [1, { type: 'FIXED', value: 0 }],
  ] as const)('rejects invalid inputs (%s, %j)', (subtotal, coupon) => {
    expect(() => priceWithCoupon(subtotal, coupon)).toThrow(RangeError);
  });
});
