import { PublicLayout } from "@/components/layout/product-layout";
import { OrderStatus } from "@/features/orders/order-status";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PublicLayout>
      <main className="operations-page account-page">
        <header className="page-heading">
          <div>
            <h1>Trạng thái đơn hàng</h1>
            <p>Thông tin đơn được xác nhận từ máy chủ.</p>
          </div>
        </header>
        <OrderStatus id={id} />
      </main>
    </PublicLayout>
  );
}
