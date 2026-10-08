import { TicketScanner } from "@/features/ticket-scanner/ticket-scanner";

export default async function TicketScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ showtimeId?: string }>;
}) {
  const { showtimeId } = await searchParams;
  return <TicketScanner initialShowtimeId={showtimeId ?? ""} />;
}
