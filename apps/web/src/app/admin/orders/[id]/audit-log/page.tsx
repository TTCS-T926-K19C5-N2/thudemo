import { OrderAuditLog } from "@/features/order-review/order-audit-log";

export default async function AdminOrderAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderAuditLog orderId={id} />;
}
