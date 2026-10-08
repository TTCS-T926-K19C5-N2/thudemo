import { OrderReview } from "@/features/order-review/order-review";
import { historyPage } from "@/lib/contracts/order-history";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <OrderReview id={id} page={historyPage(query.page) ?? 1} />;
}
