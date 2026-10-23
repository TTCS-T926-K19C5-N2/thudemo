import { MyTickets } from "@/features/tickets/my-tickets";
import Link from "next/link";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { page = "1" } = await searchParams;
  if (
    typeof page !== "string" ||
    !/^[1-9]\d*$/.test(page) ||
    !Number.isSafeInteger(Number(page)) ||
    Number(page) > 214748364
  )
    return (
      <PublicLayout>
        <div className="operations-page account-page">
          <h1>Trang không hợp lệ</h1>
          <Button asChild>
            <Link href="/account/tickets">Vé của tôi</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  return <MyTickets key={page} page={Number(page)} />;
}
