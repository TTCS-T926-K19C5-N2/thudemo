import { OrderHistory } from "@/features/orders/order-history";
import { historyPage } from "@/lib/contracts/order-history";

export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  return <OrderHistory page={historyPage((await searchParams).page)} />;
}
