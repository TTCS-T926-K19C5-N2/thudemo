import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/contracts/orders";

const statuses = {
  PENDING: { label: "Chờ thanh toán", variant: "secondary" },
  PENDING_PAYMENT: { label: "Chờ thanh toán", variant: "secondary" },
  PAID: { label: "Đã thanh toán", variant: "default" },
  CANCELLED: { label: "Đã hủy", variant: "outline" },
  EXPIRED: { label: "Đã hết hạn", variant: "destructive" },
  NEEDS_REVIEW: { label: "Cần kiểm tra", variant: "outline" },
} as const;

export function OrderBadge({ status }: { status: OrderStatus }) {
  const { label, variant } = statuses[status];
  return (
    <Badge variant={variant} className="order-status-badge">
      {label}
    </Badge>
  );
}
