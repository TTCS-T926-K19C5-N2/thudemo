import { MyTickets } from "@/features/tickets/my-tickets";
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
      <main>
        <h1>Trang không hợp lệ</h1>
        <a href="/account/tickets">Vé của tôi</a>
      </main>
    );
  return <MyTickets key={page} page={Number(page)} />;
}
