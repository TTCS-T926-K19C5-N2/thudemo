import { OrderReview } from "@/features/order-review/order-review";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderReview id={id} />;
}
