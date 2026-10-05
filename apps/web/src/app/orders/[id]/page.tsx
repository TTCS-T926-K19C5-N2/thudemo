import { PublicLayout } from "@/components/layout/product-layout";
import { OrderSummary } from "@/features/orders/order-summary";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PublicLayout signedIn>
      <OrderSummary id={id} />
    </PublicLayout>
  );
}
