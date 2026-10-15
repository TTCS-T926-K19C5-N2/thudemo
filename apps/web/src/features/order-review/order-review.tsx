"use client";

import { OrderDetail } from "@/features/orders/order-detail";

export interface OrderReviewProps {
  id: string;
  page?: number;
  onPay?: () => void;
}

// S-17 and S-32 share the V1 detail surface and authenticated reader.
export function OrderReview({ id, page = 1, onPay }: OrderReviewProps) {
  return <OrderDetail id={id} page={page} onPay={onPay} />;
}
